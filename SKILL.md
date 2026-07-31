---
name: conductor
description: >-
  Orchestrate multiple Pi agents through Herdr panes. Use when the user asks to
  delegate, coordinate, supervise, or run work with multiple agents. Default to
  sequential stages; run independent stages in parallel when the user asks.
compatibility: Requires Pi running inside Herdr and the `cyber-mux` CLI.
---

# Conductor

Act as the user's single chat point for a small crew of Pi agents.

## Rules

- Spawn **Pi only**. Do not launch Claude, Codex, or another harness.
- Use Herdr as the session backend through `cyber-mux`.
- Use Herdr-native worktrees; do not manually split panes or invent a second
  worktree system.
- Default to sequential stages. Use parallel panes only when the user asks for
  parallel work or clearly identifies independent tasks.
- Keep the user informed with short stage and blocker updates.
- Do not claim completion from pane output alone: verify the agent status and
  read its final report/output.
- Never merge, delete a worktree, or discard changes without the user's explicit
  approval.

## Start-up check

Run:

```bash
cyber-mux doctor
cyber-mux list --format agent
```

If the backend is not `herdr`, stop and report that Conductor requires Pi to be
running inside Herdr. Do not silently fall back to tmux.

## Dispatch

Turn the request into the smallest useful stages. Each stage gets one Pi pane
and one isolated Herdr worktree.

Keep a single layout anchor for the crew:

- The first agent splits right of the Conductor pane with `--at pane:right`.
- Save that pane's ID as `crew_anchor`.
- Every later agent splits down from `crew_anchor` with `--at pane:down`.
- Do not focus worker panes; leave the user's active view on Conductor.

Create the first pane/worktree in the current Herdr workspace and tab:

```bash
cyber-mux worktree add \
  --branch "conductor/<short-stage-name>" \
  --label "conductor-<short-stage-name>" \
  --at pane:right \
  --launch "pi" \
  --format json
```

For each later pane/worktree, pin cyber-mux's split target to the anchor pane:

```bash
CYBER_MUX=herdr CYBER_MUX_PANE=<crew_anchor> \
  cyber-mux worktree add \
  --branch "conductor/<short-stage-name>" \
  --label "conductor-<short-stage-name>" \
  --at pane:down \
  --launch "pi" \
  --format json
```

The explicit `CYBER_MUX_PANE` prevents later splits from accidentally targeting
Conductor or whichever pane is focused. Keep the returned pane IDs for status
and messaging. Do not call `cyber-mux focus` during normal dispatch.

Then send the agent a concise brief and submit it:

```bash
cyber-mux submit <pane-id> '<brief>'
```

The brief must include:

1. The stage objective.
2. The relevant files or repository scope.
3. The expected deliverable.
4. How the agent should report done, blocked, or failed.
5. A request not to merge or destroy work.

For parallel work, create all independent panes first: one right-hand anchor, then down-splits from that anchor. Keep them in the current workspace and tab, and leave focus on Conductor. Do not parallelize stages with dependencies.

## Supervision

Check the crew with:

```bash
cyber-mux list --format agent
```

Use the Herdr agent status as the primary lifecycle signal. When a pane reaches
a terminal state, read it:

```bash
cyber-mux read <pane-id> --lines 120
```

Treat `done` as ready for review, `blocked` as requiring a decision or fix,
`failed` as unsuccessful, and missing/unknown as an operational problem. If a
status is ambiguous, inspect the pane rather than guessing.

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

At the end, report each worktree/branch and whether it is ready for review.
Leave cleanup and merging to an explicit user instruction.
