---
name: conductor
description: >-
  Orchestrate multiple Pi agents through Herdr panes. Translate natural-language
  work requests into sequential or parallel stages, verify each stage, and
  preserve only work that still needs review.
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

If the request is exactly `status`, do not dispatch work. Reconcile and render
the plugin inventory instead:

```bash
PLUGIN_ROOT=$(herdr plugin list --json | jq -r \
  '.result.plugins[] | select(.plugin_id == "conductor.herdr") | .plugin_root')
REPO_ROOT=$(git rev-parse --show-toplevel)
CONDUCTOR_REPO_ROOT="$REPO_ROOT" \
  node "$PLUGIN_ROOT/bin/conductor-herdr.mjs" status --json
```

Report the returned worktree, lifecycle, agent, branch, dirty, and cleanup
fields directly. Do not infer or invent missing facts.

## Translate the request

Before dispatching, turn the request into a small plan. Show the plan briefly
when the request is ambiguous; otherwise keep it internal.

Map intent to stages:

- **parallel**, **concurrent**, **at the same time** → independent stages;
  dispatch all before waiting.
- **sequential**, **then**, **after**, **once**, **depends on** → ordered stages;
  do not dispatch the dependent stage early.
- **independent**, **separate**, **each** → candidates for parallel execution;
  confirm there is no shared file or dependency.
- **review**, **inspect**, **investigate** → read-only or diagnostic work;
  require evidence and do not invent implementation changes.
- **implement**, **fix**, **build**, **add** → an implementation stage with
  tests and a committed branch result.
- **commit**, **merge**, **ship**, **clean up** → explicit delivery actions;
  never infer merge permission from a successful worker.

Translate dependencies into a DAG, not a vague list. Default to sequential when
parallel safety is unclear. Explicit user instructions override defaults,
especially requests not to commit, merge, or delete.

## Rules

- Spawn Pi only.
- Use Herdr through `cyber-mux`; do not invent another pane or worktree system.
- Default to sequential stages. Parallelize only independent stages.
- Every stage gets verification appropriate to its deliverable.
- Workers commit validated changes on their own `conductor/<stage>` branch unless
  the user explicitly says not to commit.
- Never merge to the user's branch unless explicitly requested.
- Close completed panes. Remove their worktrees only when cleanup is safe.
- Preserve blocked, failed, dirty, or explicitly retained worktrees.
- Treat the plugin inventory as the source of truth for worktree status.

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

Each stage gets one Pi pane and one Herdr worktree.

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

Use returned values, then submit the brief:

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

For parallel work, create every pane first: one right-hand pane, then
pane-down splits from the same anchor. Do not parallelize dependent stages.

## Worker brief

Every brief includes:

1. Objective and repository scope.
2. Expected deliverable.
3. Dependencies and files that must not be changed.
4. Verification instructions.
5. Done, blocked, and failed reporting instructions.
6. A prohibition on merging, deleting, or destroying work.

For implementation work, instruct the worker to:

1. Run the smallest relevant tests, lint, build, or artifact checks.
2. Review its own diff with `/code-review main` when applicable.
3. Run `/no-mistakes` after committing when the repository is configured for it.
4. Commit validated changes on `conductor/<stage>` unless explicitly forbidden.
5. Report the commit SHA, checks run, and any remaining concerns.

For non-code work, require direct verification of the requested artifact or
observable result. Do not claim that a prompt was effective merely because it
was sent.

## Supervision and cleanup

Use Herdr's native `pane.agent_status_changed` and `pane.exited` events; do not
poll. Registered Pi workers may finish as `idle`; treat that as terminal only
for a registered worker. Also handle `done`, `blocked`, and `unknown`.

When a worker is terminal:

```bash
herdr agent read <pane-id> --source recent --lines 120
herdr pane close <pane-id>
```

Read output before closing. Advance sequential stages only when the previous
result is credible. For parallel work, wait for every stage and summarize each
result.

After reading and verifying a terminal worker, close only its pane. The Herdr
plugin observes `pane.exited` and attempts safe cleanup of the completed
worktree. It removes the worktree, not its branch, and never uses `--force`.

If the worktree is dirty or removal fails, the plugin records `preserve` and
reports the reason. Keep blocked, failed, explicitly uncommitted, or retained
worktrees. Do not manually prune or use broad `worktree prune`; cleanup is
runtime-enforced per completed stage.

## Reporting

Keep updates compact:

```text
Plan: <sequential/parallel stages>
Stage: <name> — <status>
Checks: <tests/review/no-mistakes>
Branch: <branch or none>
Next: <next action or decision>
```

At completion, list every branch and whether its worktree was removed,
preserved for review, blocked, or failed. Leave merging and destructive cleanup
to the user unless explicitly requested.
