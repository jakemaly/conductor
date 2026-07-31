#!/usr/bin/env node
import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";

const herdr = process.env.HERDR_BIN_PATH || "herdr";
const pluginId = process.env.HERDR_PLUGIN_ID || "conductor.herdr";
const defaultStateHome = process.env.XDG_STATE_HOME || join(process.env.HOME || process.cwd(), ".local", "state");
const stateDir = process.env.HERDR_PLUGIN_STATE_DIR || join(defaultStateHome, "herdr", "plugins", pluginId);
const statePath = join(stateDir, "conductor.json");
const terminal = new Set(["done", "blocked", "unknown"]);

function call(args, { json = true } = {}) {
  const r = spawnSync(herdr, args, { encoding: "utf8" });
  const out = (r.stdout || "").trim();
  if (r.status !== 0) throw new Error((r.stderr || out || `herdr ${args.join(" ")} failed`).trim());
  if (!json) return out;
  try { return JSON.parse(out); } catch { throw new Error(`Invalid Herdr JSON: ${out.slice(0, 300)}`); }
}

function load() {
  if (!existsSync(statePath)) return { version: 1, tasks: {}, pending: [] };
  return JSON.parse(readFileSync(statePath, "utf8"));
}

function save(state) {
  mkdirSync(dirname(statePath), { recursive: true });
  const tmp = `${statePath}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(state, null, 2)}\n`);
  renameSync(tmp, statePath);
}

function context() {
  try { return JSON.parse(process.env.HERDR_PLUGIN_CONTEXT_JSON || "{}"); } catch { return {}; }
}

function snapshot() {
  return call(["api", "snapshot"]).result?.snapshot || {};
}

function paneMap(snap) {
  return new Map((snap.panes || []).map((p) => [p.pane_id, p]));
}

function reconcile() {
  const state = load();
  const snap = snapshot();
  const panes = paneMap(snap);
  for (const task of Object.values(state.tasks)) {
    const pane = panes.get(task.pane);
    if (task.status !== "parked") task.status = pane?.agent_status || "unknown";
    if (pane) {
      task.cwd = pane.cwd || task.cwd;
      task.workspace_id = pane.workspace_id || task.workspace_id;
      task.tab_id = pane.tab_id || task.tab_id;
    }
  }
  const ctx = context();
  state.conductor_pane ||= ctx.pane_id || snap.focused_pane_id;
  state.workspace_id ||= ctx.workspace_id || snap.focused_workspace_id;
  state.tab_id ||= ctx.tab_id || snap.focused_tab_id;
  save(state);
  return state;
}

function event() {
  const state = load();
  let payload;
  try { payload = JSON.parse(process.env.HERDR_PLUGIN_EVENT_JSON || "{}"); } catch { payload = {}; }
  const data = payload.data || payload;
  const pane = data.pane_id;
  const task = Object.values(state.tasks).find((t) => t.pane === pane);
  if (!task) return;
  const status = data.agent_status || (payload.event === "pane.exited" ? "unknown" : null);
  if (!status) return;
  const eventKey = `${payload.event || data.type}:${pane}:${data.state_change_seq ?? data.revision ?? ""}:${status}`;
  if (task.last_event === eventKey) return;
  task.status = status;
  task.last_event = eventKey;
  task.updated_at = new Date().toISOString();
  save(state); // persist before waking the Conductor
  if (terminal.has(status) && state.conductor_pane && state.conductor_pane !== pane) {
    const text = `Conductor event: stage ${task.stage} is ${status}; pane ${pane}; worktree ${task.worktree || "unknown"}. Read the worker output before advancing.`;
    try { call(["agent", "send", state.conductor_pane, text], { json: false }); } catch (e) { console.error(String(e.message || e)); }
  }
}

function status() {
  const state = reconcile();
  const rows = Object.values(state.tasks);
  console.log(rows.length ? rows.map((t) => `${t.stage}\t${t.status}\t${t.pane || "-"}\t${t.worktree || "-"}`).join("\n") : "No Conductor tasks.");
}

function park(args) {
  const state = load();
  const task = state.tasks[args[0]];
  if (!task) throw new Error(`unknown stage: ${args[0] || ""}`);
  if (task.pane) {
    try { call(["pane", "close", task.pane], { json: false }); } catch (e) { console.error(String(e.message || e)); }
  }
  task.pane = null;
  task.status = "parked";
  task.updated_at = new Date().toISOString();
  save(state);
  console.log(JSON.stringify(task));
}

function reuse(args) {
  const state = reconcile();
  const task = state.tasks[args[0]];
  if (!task?.worktree) throw new Error(`no parked worktree for stage: ${args[0] || ""}`);
  const opened = call(["worktree", "open", "--path", task.worktree, "--no-focus", "--json"]);
  const root = opened.result?.root_pane || {};
  if (!root.pane_id) throw new Error("Herdr did not return the reopened worktree pane");
  const moved = call(["pane", "move", root.pane_id, "--tab", state.tab_id, "--split", "down", "--target-pane", state.crew_anchor || state.conductor_pane, "--no-focus", "--json"]);
  const pane = moved.result?.pane?.pane_id || moved.result?.previous_pane_id || root.pane_id;
  call(["pane", "run", pane, "pi"], { json: false });
  task.pane = pane;
  task.status = "working";
  task.updated_at = new Date().toISOString();
  save(state);
  console.log(JSON.stringify(task));
}

function dispatch(args) {
  const [stage, branch, brief] = args;
  if (!stage || !branch || !brief) throw new Error("usage: dispatch <stage> <branch> <brief>");
  const state = reconcile();
  const first = !state.crew_anchor;
  const split = first ? "right" : "down";
  const created = call(["worktree", "create", "--workspace", state.workspace_id, "--branch", branch, "--label", `conductor-${stage}`, "--no-focus", "--json"]);
  const result = created.result || {};
  const root = result.root_pane || {};
  const worktree = result.worktree?.path || result.workspace?.worktree?.checkout_path;
  if (!root.pane_id || !worktree) throw new Error("Herdr did not return a worktree root pane");
  const moved = call(["pane", "move", root.pane_id, "--tab", state.tab_id, "--split", split, "--target-pane", first ? state.conductor_pane : state.crew_anchor, "--no-focus", "--json"]);
  const pane = moved.result?.pane?.pane_id || moved.result?.previous_pane_id || root.pane_id;
  call(["pane", "run", pane, "pi"], { json: false });
  state.crew_anchor ||= pane;
  state.tasks[stage] = { stage, pane, worktree, branch, status: "working", workspace_id: state.workspace_id, tab_id: state.tab_id, created_at: new Date().toISOString() };
  save(state);
  call(["agent", "send", pane, brief], { json: false });
  console.log(JSON.stringify(state.tasks[stage]));
}

try {
  const [command, ...args] = process.argv.slice(2);
  if (command === "event") event();
  else if (command === "reconcile") reconcile();
  else if (command === "status") status();
  else if (command === "park") park(args);
  else if (command === "reuse") reuse(args);
  else if (command === "dispatch") dispatch(args);
  else throw new Error("usage: conductor-herdr <event|reconcile|status|park|reuse|dispatch>");
} catch (e) {
  console.error(e.message || e);
  process.exitCode = 1;
}
