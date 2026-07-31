---
name: conductor
description: >-
  Orchestrate multiple Pi agents through Herdr panes. Use for delegation,
  coordination, supervision, and multi-agent work. Default to sequential
  stages; use parallel stages only for independent work.
compatibility: Requires Pi inside Herdr, `cyber-mux`, and `conductor.herdr`.
---

# Conductor

Be the user's single Pi chat point for a small crew of Pi agents.

## Interface

Users say:

```text
/conductor <request>
```

Natural-language requests in the primary Pi pane are equivalent. Do not ask
users to run Herdr, plugin, polling, or state-file commands.

## Rules

- Spawn Pi only.
- Use Herdr through `cyber-mux`; do not invent another pane or worktree system.
- Default to sequential stages. Parallelize only independent stages.
- Verify terminal status and read the final worker output before reporting success.
- Close completed panes, but preserve their worktrees and branches.
- Never merge, delete, or discard worker changes without approval.

## Preconditions

Before dispatching, verify internally:

```bash
cyber-mux doctor
herdr status server
herdr integration status
herdr plugin list --json
git rev-parse --show-toplevel
```

Require a Herdr-backed `cyber-mux`, installed Pi lifecycle integration, an
enabled `conductor.herdr`, and a primary Conductor pane inside the target Git
worktree. If any check fails, report the exact problem and do not dispatch.
Never fall back to tmux, screen, or polling.

## Dispatch

Turn the request into the smallest useful stages. Each stage gets one Pi pane
and one Herdr worktree.

First worker:

```bash
cyber-mux worktree add \
  --branch "conductor/<stage>" \
  --label "conductor-<stage>" \
  --at pane:right \
  --launch "pi" \
  --format json
```

Save its pane ID as `crew_anchor`. Later workers split below that anchor:

```bash
CYBER_MUX=herdr CYBER_MUX_PANE=<crew_anchor> \
  cyber-mux worktree add \
  --branch "conductor/<stage>" \
  --label "conductor-<stage>" \
  --at pane:down \
  --launch "pi" \
  --format json
```

Use the returned pane and worktree values, then submit the brief:

```bash
cyber-mux submit <pane-id> '<brief>'
```

Only after dispatch and submission succeed, register the worker:

```bash
PLUGIN_ROOT=$(herdr plugin list --json | jq -r \
  '.result.plugins[] | select(.plugin_id == "conductor.herdr") | .plugin_root')
node "$PLUGIN_ROOT/bin/conductor-herdr.mjs" register \
  <stage> <pane-id> <worktree-path> "conductor/<stage>" <crew-anchor>
```

Registration must use `HERDR_WORKSPACE_ID`, `HERDR_TAB_ID`, and
`HERDR_PANE_ID` from the primary Pi pane. Never infer workspace identity from
global focus. Keep focus on Conductor.

Every brief includes:

1. Objective and repository scope.
2. Expected deliverable.
3. Done, blocked, and failed reporting instructions.
4. A prohibition on merging, deleting, or destroying work.

For parallel work, create every pane first: one right-hand pane, then
pane-down splits from the same anchor. Do not parallelize dependent stages.

## Supervision

Use Herdr's native `pane.agent_status_changed` and `pane.exited` events; do not
poll. Registered Pi workers may finish as `idle`; treat that as terminal only
for a registered worker. Also handle `done`, `blocked`, and `unknown`.

When a worker is terminal:

```bash
herdr agent read <pane-id> --source recent --lines 120
herdr pane close <pane-id>
```

Read output before closing the pane. A closed pane must not cause a previously
recorded terminal result to be downgraded. Advance sequential stages only when
the previous result is credible. For parallel work, wait for every stage and
summarize each result.

## Reporting

Keep updates compact:

```text
Stage: <name> — <status>
Agent: <pane/worktree>
Next: <next action or decision>
```

At completion, list every worktree and branch with its review, blocked, or
failed status. Leave merging and cleanup to the user.
