---
name: conductor
description: >-
  Orchestrate multiple Pi agents through Herdr panes. Use when the user asks to
  delegate, coordinate, supervise, or run work with multiple agents. Default to
  sequential stages; run independent stages in parallel when the user asks.
compatibility: Requires Pi running inside Herdr, `cyber-mux`, and the `conductor.herdr` plugin.
---

# Conductor

Act as the user's single chat point for a small crew of Pi agents.

## User interface

The user interacts only through Pi:

```text
/conductor <request>
```

Natural-language requests in the primary Pi pane are equivalent. Do not ask the
user to run plugin scripts, `herdr` commands, polling loops, or state-file
inspection commands. Those are internal runtime details. Plan the smallest
stages, dispatch them through the Herdr-backed `cyber-mux` path, and report
compact stage/blocker updates in this conversation.

## Rules

- Spawn **Pi only**. Do not launch Claude, Codex, or another harness.
- Use Herdr as the session backend through `cyber-mux` and the `conductor.herdr` event bridge.
- Use Herdr-native worktrees; do not manually split panes or invent a second
  worktree system.
- Default to sequential stages. Use parallel panes only when the user asks for
  parallel work or clearly identifies independent tasks.
- Keep the user informed with short stage and blocker updates.
- Do not claim completion from pane output alone: verify the agent status and
  read its final report/output.
- By default, close a completed agent pane but preserve its worktree and branch.
  Completion does not imply merge or deletion.
- Reuse a parked worktree only for an explicit follow-up; otherwise start a
  fresh Pi agent for a new stage.
- Never merge, delete a worktree, or discard changes without the user's explicit
  approval.

## Start-up check

Verify the real runtime prerequisites:

```bash
cyber-mux doctor
herdr status server
herdr integration status
herdr plugin list --json
git rev-parse --show-toplevel
```

Require the backend to be Herdr, Pi's lifecycle integration to be installed,
the primary Conductor Pi pane to be inside the target Git repository, and
`conductor.herdr` to be enabled. If any prerequisite is missing, report the
exact setup problem and do not dispatch. Do not silently fall back to tmux or
screen polling.

`cyber-mux` owns dispatch/layout/prompt submission. The plugin owns only durable
workspace-scoped task state and native lifecycle events. Herdr is authoritative
for live pane/agent/worktree facts.

## Dispatch

Turn the request into the smallest useful stages. Each stage gets one Pi pane
and one isolated Herdr worktree.

Keep a single layout anchor for the crew:

- The first agent splits right of the Conductor pane with `--at pane:right`.
- Save that pane's ID as `crew_anchor`.
- Every later agent splits down from `crew_anchor` with `--at pane:down`.
- Do not focus worker panes; leave the user's active view on Conductor.

Dispatch through the proven Herdr-backed `cyber-mux` path:

```bash
cyber-mux worktree add \
  --branch "conductor/<short-stage-name>" \
  --label "conductor-<short-stage-name>" \
  --at pane:right \
  --launch "pi" \
  --format json
```

For later workers, pin the split to the stable anchor:

```bash
CYBER_MUX=herdr CYBER_MUX_PANE=<crew_anchor> \
  cyber-mux worktree add \
  --branch "conductor/<short-stage-name>" \
  --label "conductor-<short-stage-name>" \
  --at pane:down \
  --launch "pi" \
  --format json
```

Use the returned pane/worktree/branch values, then submit the brief:

```bash
cyber-mux submit <pane-id> '<brief>'
```

After successful submission, register the mapping internally. Never register
before dispatch and submission succeed:

```bash
PLUGIN_ROOT=$(herdr plugin list --json | jq -r \
  '.result.plugins[] | select(.plugin_id == "conductor.herdr") | .plugin_root')
node "$PLUGIN_ROOT/bin/conductor-herdr.mjs" register \
  <short-stage-name> <pane-id> <worktree-path> \
  "conductor/<short-stage-name>" <crew-anchor>
```

`HERDR_WORKSPACE_ID`, `HERDR_TAB_ID`, and `HERDR_PANE_ID` come from the primary
Pi pane. Registration fails rather than guessing a focused workspace.
The first worker is right of Conductor; later workers are below `crew_anchor`.
Do not focus workers.

The brief must include:

1. The stage objective.
2. The relevant files or repository scope.
3. The expected deliverable.
4. How the agent should report done, blocked, or failed.
5. A request not to merge or destroy work.

For parallel work, create all independent panes first: one right-hand anchor, then down-splits from that anchor. Keep them in the current workspace and tab, and leave focus on Conductor. Do not parallelize stages with dependencies.

## Supervision

Do not run a polling loop. The plugin subscribes to Herdr's native
`pane.agent_status_changed` and `pane.exited` events, persists workspace-scoped
state, and wakes Conductor for `done`, `blocked`, `unknown`, or exited workers.

For internal diagnostics only:

```bash
node "$PLUGIN_ROOT/bin/conductor-herdr.mjs" status
```

Use the Herdr agent status as the primary lifecycle signal. When the plugin
reports a terminal state, read the pane:

```bash
herdr agent read <pane-id> --source recent --lines 120
```

Treat `done` as ready for review, `blocked` as requiring a decision or fix,
`unknown` or an exited pane as an operational problem. If a status is
ambiguous, inspect the pane rather than guessing.

When an agent reaches `done` or exits, read its final output, record the
worktree path and branch in the response, then close only the pane:

```bash
herdr pane close <pane-id>
```

Closing the pane does not remove the worktree. This is the default because the
worktree may contain unmerged changes awaiting review, a blocked merge, a
handoff, or later inspection.

When an agent reaches a terminal state, close only the pane after reading its
final output. Preserve the worktree and branch by default. Reopen parked work
through the existing `cyber-mux worktree open` path only for an explicit follow-up.
There is no plugin cleanup action; never force-delete a worktree.

Advance sequential stages only after the prior stage is done and its output is
credible. For parallel stages, wait until every stage is terminal, then
summarize results and ask for any needed decision before integrating them.

## Reporting

Keep responses compact:

```text
Stage: <name> — <status>
Agent: <pane/worktree>
Next: <next action or decision needed>
```

At the end, report each worktree/branch and whether it is ready for review,
parked, blocked, or failed. Leave merging, worktree removal, and destructive
cleanup to an explicit user instruction.
