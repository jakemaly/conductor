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
  return { version: 1, workers: {} };
}

function load() {
  if (!existsSync(statePath)) return emptyState();
  const state = JSON.parse(readFileSync(statePath, "utf8"));
  if (state.workers && typeof state.workers === "object") return state;
  // The old state tracked inventory and lifecycle policy; it is intentionally not
  // part of this thin sub-agent bridge.
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

function workerKey(workspaceId, paneId) {
  return `${workspaceId}:${paneId}`;
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
  const paneId = data.pane_id;
  const result = withState((state) => {
    const worker = state.workers[workerKey(workspaceId, paneId)];
    if (!worker) return null;

    const exited = envelope.event === "pane.exited";
    if (exited && terminal.has(worker.status)) {
      worker.pane_exited_at ||= new Date().toISOString();
      worker.updated_at = new Date().toISOString();
      return null;
    }
    const status = data.agent_status || (exited ? "unknown" : null);
    if (!status) return null;
    const eventKey = [envelope.event || data.type, workspaceId, paneId, data.revision || "", status].join(":");
    if (worker.last_event_key === eventKey) return null;

    worker.status = status;
    worker.last_event_key = eventKey;
    worker.updated_at = new Date().toISOString();
    if (!terminal.has(status)) return null;
    if (!worker.parent_pane || worker.parent_pane === paneId) return null;
    return {
      pane: worker.parent_pane,
      text: `Conductor event: sub-agent ${worker.stage} is ${status}; pane ${paneId}; worktree ${worker.worktree || "unknown"}. Read its report.`,
    };
  });

  if (result) {
    try {
      // Herdr 0.7.3 queues literal agent.send input; Enter submits it to Pi.
      call(["agent", "send", result.pane, result.text], { json: false });
      call(["pane", "send-keys", result.pane, "enter"], { json: false });
    } catch (error) {
      console.error(error.message || error);
    }
  }
}

function register(args) {
  const [stage, pane, worktree, branch] = args;
  if (!stage || !pane || !worktree || !branch) {
    throw new Error("usage: register <stage> <pane> <worktree> <branch>");
  }
  const context = invocationContext();
  if (!context.workspaceId || !context.tabId || !context.paneId) {
    throw new Error("Conductor registration requires HERDR_WORKSPACE_ID, HERDR_TAB_ID, and HERDR_PANE_ID");
  }

  const worker = withState((state) => {
    const key = workerKey(context.workspaceId, pane);
    state.workers[key] = {
      stage,
      pane,
      worktree,
      branch,
      workspace_id: context.workspaceId,
      tab_id: context.tabId,
      parent_pane: context.paneId,
      status: "working",
      created_at: new Date().toISOString(),
    };
    return state.workers[key];
  });
  console.log(JSON.stringify(worker));
}

try {
  const [command, ...args] = process.argv.slice(2);
  if (command === "event") event();
  else if (command === "register") register(args);
  else throw new Error("usage: conductor-herdr <event|register>");
} catch (error) {
  console.error(error.message || error);
  process.exitCode = 1;
}
