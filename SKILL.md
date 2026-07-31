---
name: conductor
description: >-
  Orchestrate multiple Pi agents through Herdr panes. Use when the user asks to
  delegate, coordinate, supervise, or run work with multiple agents. Default to
  sequential stages; run independent stages in parallel when the user asks.
compatibility: Requires Pi running inside Herdr and the `conductor.herdr` plugin.
---

# Conductor

Act as the user's single chat point for a small crew of Pi agents.

## Rules

- Spawn **Pi only**. Do not launch Claude, Codex, or another harness.
- Use Herdr as the session backend through the `conductor.herdr` plugin.
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

Verify Herdr and the linked runtime plugin:

```bash
herdr status server
herdr plugin list --json
herdr plugin action invoke conductor.herdr.status
```

If the server is unavailable or `conductor.herdr` is disabled/missing, stop and
report the exact setup problem. Do not silently fall back to tmux or polling.

The plugin owns durable fleet state and native lifecycle events. Herdr is the
source of truth for live pane/agent/worktree facts.

## Dispatch

Turn the request into the smallest useful stages. Each stage gets one Pi pane
and one isolated Herdr worktree.

Keep a single layout anchor for the crew:

- The first agent splits right of the Conductor pane with `--at pane:right`.
- Save that pane's ID as `crew_anchor`.
- Every later agent splits down from `crew_anchor` with `--at pane:down`.
- Do not focus worker panes; leave the user's active view on Conductor.

Dispatch through the linked plugin. It creates the Herdr worktree, moves its
root pane into the Conductor tab, preserves the right/down crew layout, launches
Pi, persists the mapping, and submits the brief:

```bash
PLUGIN_ROOT=$(herdr plugin list --json | jq -r \
  '.result.plugins[] | select(.plugin_id == "conductor.herdr") | .plugin_root')
node "$PLUGIN_ROOT/bin/conductor-herdr.mjs" dispatch \
  <short-stage-name> \
  "conductor/<short-stage-name>" \
  '<brief>'
```

The first worker targets Conductor with `pane:right`; later workers target the
stable `crew_anchor` with `pane:down`. Do not focus workers.

The brief must include:

1. The stage objective.
2. The relevant files or repository scope.
3. The expected deliverable.
4. How the agent should report done, blocked, or failed.
5. A request not to merge or destroy work.

For parallel work, create all independent panes first: one right-hand anchor, then down-splits from that anchor. Keep them in the current workspace and tab, and leave focus on Conductor. Do not parallelize stages with dependencies.

## Supervision

Do not run a polling loop. The plugin subscribes to Herdr's native
`pane.agent_status_changed` and `pane.exited` events, persists state, and wakes
Conductor for `done`, `blocked`, `unknown`, or exited workers.

For an on-demand snapshot, invoke:

```bash
herdr plugin action invoke conductor.herdr.status
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

To park or explicitly reuse a worktree, call the plugin directly:

```bash
node "$PLUGIN_ROOT/bin/conductor-herdr.mjs" park <stage>
node "$PLUGIN_ROOT/bin/conductor-herdr.mjs" reuse <stage>
```

Parking closes only the pane and preserves the worktree/branch. Reuse opens the
same worktree in a fresh Pi pane. There is no cleanup action by default; remove
worktrees only after explicit approval using Herdr's safety checks, never force.

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
