#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";

const herdr = process.env.HERDR_BIN_PATH || "herdr";
const pluginId = process.env.HERDR_PLUGIN_ID || "conductor.herdr";
const stateHome = process.env.XDG_STATE_HOME || join(process.env.HOME || process.cwd(), ".local", "state");
const stateDir = process.env.HERDR_PLUGIN_STATE_DIR || join(stateHome, "herdr", "plugins", pluginId);
const statePath = join(stateDir, "conductor.json");
const lockPath = `${statePath}.lock`;
// A registered worker's working -> idle is its normal Pi completion signal in Herdr 0.7.3.
// Do not apply this to unregistered panes; event() only finds registered tasks.
const terminal = new Set(["done", "idle", "blocked", "unknown"]);

function call(args, { json = true } = {}) {
  const result = spawnSync(herdr, args, { encoding: "utf8" });
  const stdout = (result.stdout || "").trim();
  if (result.status !== 0) {
    throw new Error((result.stderr || stdout || `herdr ${args.join(" ")} failed`).trim());
  }
  if (!json) return stdout;
  try {
    return JSON.parse(stdout);
  } catch {
    throw new Error(`Invalid Herdr JSON: ${stdout.slice(0, 300)}`);
  }
}

function emptyState() {
  return { version: 1, workspaces: {} };
}

function load() {
  if (!existsSync(statePath)) return emptyState();
  const state = JSON.parse(readFileSync(statePath, "utf8"));
  if (state.workspaces && typeof state.workspaces === "object") return state;
  // Old state guessed a single focused workspace. It is unsafe to migrate.
  return emptyState();
}

function save(state) {
  const temporary = `${statePath}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`);
  renameSync(temporary, statePath);
}

function pause(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function withState(update) {
  mkdirSync(dirname(statePath), { recursive: true });
  for (let attempt = 0; attempt < 300; attempt += 1) {
    try {
      mkdirSync(lockPath);
      break;
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      try {
        if (Date.now() - statSync(lockPath).mtimeMs > 30_000) {
          rmSync(lockPath, { recursive: true, force: true });
          continue;
        }
      } catch {
        // The owner may be between mkdir and its first write.
      }
      pause(10);
    }
    if (attempt === 299) throw new Error("timed out waiting for Conductor state lock");
  }

  try {
    const state = load();
    const result = update(state);
    save(state);
    return result;
  } finally {
    rmSync(lockPath, { recursive: true, force: true });
  }
}

function parseContext() {
  try {
    return JSON.parse(process.env.HERDR_PLUGIN_CONTEXT_JSON || "{}");
  } catch {
    return {};
  }
}

function invocationContext() {
  const context = parseContext();
  return {
    workspaceId: process.env.HERDR_WORKSPACE_ID || context.workspace_id,
    tabId: process.env.HERDR_TAB_ID || context.tab_id,
    paneId: process.env.HERDR_PANE_ID || context.pane_id,
  };
}

function snapshot() {
  return call(["api", "snapshot"]).result?.snapshot || {};
}

function reconcile() {
  const panes = new Map((snapshot().panes || []).map((pane) => [
    `${pane.workspace_id}:${pane.pane_id}`,
    pane,
  ]));

  return withState((state) => {
    for (const [workspaceId, workspace] of Object.entries(state.workspaces)) {
      for (const task of Object.values(workspace.tasks)) {
        const pane = panes.get(`${workspaceId}:${task.pane}`);
        if (!pane) {
          if (!task.terminal_event) task.status = "unknown";
          continue;
        }
        // A terminal event remains authoritative while Herdr's derived snapshot is idle.
        if (task.terminal_event && pane.agent_status === "idle") continue;
        if (pane.agent_status === "working") delete task.terminal_event;
        task.status = pane.agent_status || "unknown";
        task.cwd = pane.cwd || task.cwd;
        task.tab_id = pane.tab_id || task.tab_id;
      }
    }
    return state;
  });
}

function findTask(state, workspaceId, paneId) {
  if (workspaceId && state.workspaces[workspaceId]) {
    const task = Object.values(state.workspaces[workspaceId].tasks)
      .find((candidate) => candidate.pane === paneId);
    if (task) return { workspace: state.workspaces[workspaceId], task };
  }
  const matches = [];
  for (const workspace of Object.values(state.workspaces)) {
    const task = Object.values(workspace.tasks).find((candidate) => candidate.pane === paneId);
    if (task) matches.push({ workspace, task });
  }
  return matches.length === 1 ? matches[0] : null;
}

function submitPrompt(pane, text) {
  // Herdr 0.7.3 exposes literal agent.send, not agent.prompt. Submit the
  // literal text explicitly so it does not remain in Pi's input box.
  call(["agent", "send", pane, text], { json: false });
  call(["pane", "send-keys", pane, "enter"], { json: false });
}

function event() {
  let envelope;
  try {
    envelope = JSON.parse(process.env.HERDR_PLUGIN_EVENT_JSON || "{}");
  } catch {
    return;
  }
  const data = envelope.data || envelope;
  const workspaceId = data.workspace_id;
  const notification = withState((state) => {
    const found = findTask(state, workspaceId, data.pane_id);
    if (!found) return null;
    if (envelope.event === "pane.exited" && found.task.terminal_event) return null;

    const status = data.agent_status || (envelope.event === "pane.exited" ? "unknown" : null);
    if (!status) return null;
    const eventKey = [envelope.event || data.type, workspaceId, data.pane_id, data.revision || "", status].join(":");
    if (found.task.last_event_key === eventKey) return null;

    found.task.status = status;
    found.task.last_event_key = eventKey;
    found.task.updated_at = new Date().toISOString();
    if (terminal.has(status)) found.task.terminal_event = eventKey;
    else delete found.task.terminal_event;
    if (!terminal.has(status) || !found.workspace.conductor_pane || found.workspace.conductor_pane === data.pane_id) return null;
    return {
      pane: found.workspace.conductor_pane,
      text: `Conductor event: stage ${found.task.stage} is ${status}; pane ${data.pane_id}; worktree ${found.task.worktree || "unknown"}. Read the worker output before advancing.`,
    };
  });

  if (notification) {
    try {
      submitPrompt(notification.pane, notification.text);
    } catch (error) {
      console.error(error.message || error);
    }
  }
}

function register(args) {
  const [stage, pane, worktree, branch, crewAnchor] = args;
  if (!stage || !pane || !worktree || !branch) {
    throw new Error("usage: register <stage> <pane> <worktree> <branch> [crew-anchor]");
  }
  const context = invocationContext();
  if (!context.workspaceId || !context.tabId || !context.paneId) {
    throw new Error("Conductor registration requires HERDR_WORKSPACE_ID, HERDR_TAB_ID, and HERDR_PANE_ID");
  }

  const task = withState((state) => {
    const workspace = state.workspaces[context.workspaceId] ||= {
      workspace_id: context.workspaceId,
      tab_id: context.tabId,
      conductor_pane: context.paneId,
      crew_anchor: crewAnchor || pane,
      tasks: {},
    };
    workspace.tab_id = context.tabId;
    workspace.conductor_pane = context.paneId;
    workspace.crew_anchor = crewAnchor || workspace.crew_anchor || pane;
    workspace.tasks[stage] = {
      stage,
      pane,
      worktree,
      branch,
      status: "working",
      created_at: new Date().toISOString(),
    };
    return workspace.tasks[stage];
  });
  console.log(JSON.stringify(task));
}

function status() {
  const state = reconcile();
  const rows = [];
  for (const [workspaceId, workspace] of Object.entries(state.workspaces)) {
    for (const task of Object.values(workspace.tasks)) {
      rows.push(`${workspaceId}\t${task.stage}\t${task.status}\t${task.pane || "-"}\t${task.worktree || "-"}`);
    }
  }
  console.log(rows.length ? rows.join("\n") : "No Conductor tasks.");
}

try {
  const [command, ...args] = process.argv.slice(2);
  if (command === "event") event();
  else if (command === "reconcile") reconcile();
  else if (command === "register") register(args);
  else if (command === "status") status();
  else throw new Error("usage: conductor-herdr <event|reconcile|register|status>");
} catch (error) {
  console.error(error.message || error);
  process.exitCode = 1;
}
