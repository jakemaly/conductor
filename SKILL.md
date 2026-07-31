---
name: conductor
description: >-
  Create explicit Pi sub-agents in Herdr-native Git worktrees. Trigger when the
  user asks to spawn, create, launch, delegate to, or coordinate sub-agents or
  workers, including natural-language requests such as "spawn two agents" or
  "build these in parallel". Do not trigger for ordinary single-agent coding.
compatibility: Requires Pi inside Herdr, `cyber-mux`, and `conductor.herdr`.
---

# Conductor

Conductor is a thin sub-agent launcher. It creates Pi workers in Herdr-native
Git worktrees, records the parent/worker/worktree/branch mapping, routes
terminal events back to the parent Pi, and reports what each worker says. Herdr
and Git remain authoritative for live pane and worktree facts. Conductor does
not maintain a second Git inventory, implement, review, verify, commit, merge,
clean up, or invent extra stages.

## When to use it

Invoke this skill when the user explicitly asks in natural language or with
`/conductor` for sub-agents, workers, delegation, or parallel work. Examples:

```text
Spawn two Pi agents: one handles the API and one handles the UI.
Delegate this investigation to a sub-agent.
/conductor Run these three independent tasks in parallel.
```

Do not turn an ordinary single-agent coding request into a Conductor plan.
Create exactly the workers and tasks the user names. Do not add review, test,
documentation, cleanup, or other speculative stages. Pass each worker its task
without prescribing how it should implement the task.

## Preconditions

Check internally before dispatching:

```bash
cyber-mux doctor
herdr status server
herdr integration status
herdr plugin list --json
git rev-parse --show-toplevel
```

Require Herdr-backed `cyber-mux`, Pi's Herdr integration, an enabled
`conductor.herdr`, and a primary Pi pane inside the target Git worktree. If a
check fails, report it and do not dispatch. Never fall back to tmux, screen, or
polling.

## Dispatch

Use one Herdr worktree and Pi pane per explicitly requested worker.

First worker:

```bash
cyber-mux worktree add \
  --branch "conductor/<short-name>" \
  --label "conductor-<short-name>" \
  --at pane:right \
  --launch "pi" \
  --format json
```

For additional workers, split down from the first worker's pane:

```bash
CYBER_MUX=herdr CYBER_MUX_PANE=<first-worker-pane> \
  cyber-mux worktree add \
  --branch "conductor/<short-name>" \
  --label "conductor-<short-name>" \
  --at pane:down \
  --launch "pi" \
  --format json
```

Submit the user's task to the returned pane. Keep the task text intact; add
only the worker name or repository scope when needed for clarity:

```bash
cyber-mux submit <pane-id> '<user task>'
```

Only after dispatch and submission succeed, register the worker internally:

```bash
PLUGIN_ROOT=$(herdr plugin list --json | jq -r \
  '.result.plugins[] | select(.plugin_id == "conductor.herdr") | .plugin_root')
node "$PLUGIN_ROOT/bin/conductor-herdr.mjs" register \
  <worker-name> <pane-id> <worktree-path> "conductor/<short-name>"
```

Registration must use `HERDR_WORKSPACE_ID`, `HERDR_TAB_ID`, and `HERDR_PANE_ID`
from the parent Pi pane. Never infer workspace identity from global focus. Keep
focus on the parent pane.

For parallel requests, create all requested workers before waiting. For ordered
requests, dispatch only the next explicitly requested worker after its
predecessor reports completion.

## Completion

Herdr's native `pane.agent_status_changed` and `pane.exited` events wake the
parent Pi. Registered workers may finish as `idle`; treat that as terminal for
the registered worker. Also report `done`, `blocked`, and `unknown`.

When woken, read the worker's recent output and summarize its own report. Do
not independently judge correctness or add a verification workflow:

```bash
herdr agent read <pane-id> --source recent --lines 120
```

Leave every worker pane and worktree open after completion. Do not merge, close,
remove, prune, or discard anything unless the user explicitly asks.

## Reporting

Keep updates factual and compact:

```text
Worker: <name>
Status: <Herdr status>
Pane: <pane id>
Worktree: <path>
Branch: <branch>
Report: <worker's result>
```
