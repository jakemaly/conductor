---
name: conductor
description: >-
  Create Pi sub-agents in Herdr-native Git worktrees. Trigger for natural-language
  requests to spawn, launch, delegate, coordinate, or parallelize sub-agents;
  ordinary single-agent coding does not trigger it.
compatibility: Requires Pi inside Herdr, `cyber-mux`, and `conductor.herdr`.
---

# Conductor

Use this skill when the user asks for sub-agents, workers, delegation, or
parallel work, with or without `/conductor`.

Create the workers and tasks the user names. Pass each task to its worker as
written. Keep the parent Pi focused.

## Preflight

Run internally:

```bash
cyber-mux doctor
herdr status server
herdr integration status
herdr plugin list --json
git rev-parse --show-toplevel
```

Dispatch only when Herdr-backed `cyber-mux`, Pi's Herdr integration, and the
enabled `conductor.herdr` plugin are available in a Git worktree.

## Dispatch

Create one worktree and Pi pane per worker. Put the first to the right of the
parent:

```bash
cyber-mux worktree add \
  --branch "conductor/<short-name>" \
  --label "conductor-<short-name>" \
  --at pane:right \
  --launch "pi" \
  --format json
```

Put later workers below the first worker:

```bash
CYBER_MUX=herdr CYBER_MUX_PANE=<first-worker-pane> \
  cyber-mux worktree add \
  --branch "conductor/<short-name>" \
  --label "conductor-<short-name>" \
  --at pane:down \
  --launch "pi" \
  --format json
```

Submit the task to the returned pane:

```bash
cyber-mux submit <pane-id> '<task>'
```

After successful submission, register the worker:

```bash
PLUGIN_ROOT=$(herdr plugin list --json | jq -r \
  '.result.plugins[] | select(.plugin_id == "conductor.herdr") | .plugin_root')
node "$PLUGIN_ROOT/bin/conductor-herdr.mjs" register \
  <worker-name> <pane-id> <worktree-path> "conductor/<short-name>"
```

Use `HERDR_WORKSPACE_ID`, `HERDR_TAB_ID`, and `HERDR_PANE_ID` from the parent
Pi pane. Create all workers before waiting when the user requests parallel
work; otherwise advance in the requested order.

## Completion

Herdr's `pane.agent_status_changed` and `pane.exited` events wake the parent.
Treat registered `idle`, `done`, `blocked`, and `unknown` states as terminal
signals. Read the worker's report:

```bash
herdr agent read <pane-id> --source recent --lines 120
```

Leave panes and worktrees open. Report the worker name, status, pane, worktree,
branch, and its report.
