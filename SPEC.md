# Conductor: robust Pi/Herdr subagent system

## Problem Statement

Conductor currently feels homemade because the parent Pi must follow a prose recipe in a skill to create worktrees, create Herdr panes, submit prompts, and register workers. The Herdr plugin is only a thin event bridge and durable mapping ledger. The real orchestration interface is distributed across model-followed shell commands, `cyber-mux`, Herdr, and a small plugin, so behavior is difficult to discover, test, recover, and extend.

A proven Pi package, `pi-herdr-subagents`, demonstrates a stronger shape: a Pi extension owns a typed delegation tool, named role definitions, asynchronous result delivery, lifecycle projection, activity/completion evidence, interrupt handling, session extraction, compact UI, and integration tests. Conductor should consolidate around that shape instead of independently rebuilding it.

## Solution

Turn Conductor into an attributed, trimmed fork of the proven Pi/Herdr subagent extension. Make the Pi extension the deep orchestration module with a small parent-facing interface. Keep Herdr authoritative for workspace, tab, pane, agent identity, and lifecycle facts. Keep `cyber-mux` authoritative for pane/worktree creation, explicit placement, launch, and submission.

The parent Pi explicitly delegates one task or several independent tasks. The extension resolves a named global role, starts an isolated child Pi process in a dedicated Herdr tab, records durable run/worker identity, and returns immediately. Herdr events and bounded recovery checks drive lifecycle updates. Terminal events deliver each worker’s final response back to the parent as a steer message. Panes and Git resources remain open for inspection; cancellation stops the child process/turn but does not close its pane.

The first release is deliberately not a team system. Workers do not communicate directly, claim shared tasks, or form dependency graphs. The parent remains the coordinator.

## User Stories

1. As a parent Pi agent, I want one delegation tool, so that I can start a worker without reconstructing shell commands.
2. As a parent Pi agent, I want delegation to return immediately, so that I can continue independent work while the worker runs.
3. As a parent Pi agent, I want to delegate one task, so that I can use a focused worker without creating unnecessary orchestration state.
4. As a parent Pi agent, I want to launch several independent workers, so that read-heavy or otherwise parallel work can proceed concurrently.
5. As a parent Pi agent, I want each worker result delivered as it completes, so that useful findings do not wait behind slower workers.
6. As a parent Pi agent, I want terminal completion and failure notifications to wake me automatically, so that I do not need a polling loop.
7. As a parent Pi agent, I want ordinary working and idle transitions to stay out of the conversation, so that status visibility does not consume model turns.
8. As a parent Pi agent, I want to see workers in dedicated Herdr tabs, so that each worker has a readable terminal surface.
9. As a user, I want launching a worker not to steal focus from my parent pane, so that my current interaction remains uninterrupted.
10. As a user, I want worker placement to use explicit Herdr pane and workspace identity, so that a worker never lands in the newest or focused unrelated tab.
11. As a user, I want each worker to retain its pane after completion, so that I can inspect its transcript and terminal state.
12. As a user, I want cancellation to stop the child turn/process without closing its pane, so that I can inspect partial work and recover manually.
13. As a user, I want failed workers to remain inspectable, so that provider errors and partial changes are not hidden.
14. As a user, I want shared-checkout execution by default, so that read-heavy work does not create unnecessary Git worktrees.
15. As a user, I want an explicit worktree option, so that a task with conflict or destructive-edit risk can opt into filesystem isolation.
16. As a user, I want parallel shared-checkout writes to require an explicit mode, so that accidental concurrent mutation is visible.
17. As a user, I want a confirmation before overlapping shared-writing workers start, so that I knowingly accept conflict and attribution risk.
18. As a user, I want Conductor to leave files, branches, worktrees, and panes alone automatically, so that no cleanup action can discard work.
19. As a user, I want a small human command surface for status, reading, focusing, interrupting, resuming, and listing workers, so that I am not dependent on model-generated tool calls.
20. As a user, I want a compact worker widget, so that I can see active, blocked, waiting, stalled, and terminal workers without opening a dashboard.
21. As a user, I want terminal states to distinguish working, blocked, idle/done, unknown, canceled, failed, and orphaned, so that I can choose the correct next action.
22. As a user, I want a worker to ask the parent for help, so that ambiguity can be resolved without abandoning the child session.
23. As a parent Pi agent, I want to resume a saved worker session, so that a canceled or help-seeking worker can continue with new guidance.
24. As a user, I want a parent restart not to cancel active workers, so that useful work survives a UI or process restart.
25. As a parent Pi agent, I want orphaned workers reattached when I return, so that their results and statuses are not lost.
26. As a user, I want worker ownership to survive pane moves, so that pane identity changes do not silently detach a worker.
27. As a user, I want worker context isolated by default, so that the child does not inherit irrelevant parent conversation history.
28. As a parent Pi agent, I want an explicit fork/lineage option, so that a worker can receive parent context only when the task needs it.
29. As a user, I want reusable global agent roles, so that scout, worker, and reviewer behavior is consistent across projects.
30. As a user, I want built-in scout, worker, and reviewer roles, so that the package works immediately after installation.
31. As a user, I want my global role definitions to override built-in defaults, so that I can tailor model, tools, thinking, and permissions.
32. As a user, I want role definitions to control model selection, so that cheap read-only work can use a faster model while hard work uses a stronger one.
33. As a user, I want role definitions to control tool access, so that a scout can be read-only while a worker can edit.
34. As a user, I want role definitions to control process lifetime, so that autonomous roles can exit their child Pi process while interactive roles remain available.
35. As a user, I want the delegated task passed unchanged, so that Conductor does not silently add implementation, review, commit, verification, or cleanup instructions.
36. As a user, I want role instructions separate from the delegated task, so that reusable behavior does not alter the user’s request text.
37. As a user, I want no automatic delegation based only on role descriptions, so that pane creation and model cost always follow an explicit request.
38. As a user, I want no automatic retry, so that failed or mutating tasks are not duplicated without a decision.
39. As a parent Pi agent, I want the final assistant response captured as the result, so that normal Pi behavior remains the worker’s output protocol.
40. As a user, I want completion evidence to survive terminal timing races, so that a pane disappearing near completion does not lose a valid result.
41. As a maintainer, I want Herdr events to be the normal lifecycle path, so that the parent does not run a permanent polling supervisor.
42. As a maintainer, I want bounded recovery checks on startup, reload, explicit status, or uncertain events, so that missed events can be repaired without continuous polling.
43. As a maintainer, I want activity and completion evidence to be versioned and atomically written, so that partial files do not corrupt lifecycle decisions.
44. As a maintainer, I want a durable run ledger, so that parent restarts can reattach workers using stable composite identities.
45. As a maintainer, I want the orchestration interface separated from Herdr and cyber-mux adapters, so that the state model can be tested without a live terminal.
46. As a maintainer, I want Herdr to remain the source of truth for pane and agent lifecycle, so that Conductor does not duplicate host facts.
47. As a maintainer, I want cyber-mux to remain the source of truth for pane/worktree mechanics, so that Conductor does not grow another multiplexer implementation.
48. As a maintainer, I want unit tests for lifecycle, routing, identity, and result extraction, so that edge cases are deterministic.
49. As a maintainer, I want fake-Herdr orchestration tests, so that pane targeting, event routing, races, and error handling can be tested without a live UI.
50. As a maintainer, I want real Herdr/Pi integration tests, so that process launch, event delivery, pane placement, cancellation, and result wakeups are verified end to end.
51. As a package user, I want a clear install and upgrade path, so that the extension is a normal Pi package rather than a hand-linked collection of scripts.
52. As a package user, I want the upstream `pi-herdr-subagents` attribution preserved, so that the fork’s provenance and MIT license remain clear.

## Implementation Decisions

- **Orchestration module:** Build the parent-facing interface as a Pi extension. It should expose one deep delegation operation for single and independent parallel work, plus small human commands for inspection and control.
- **Reference baseline:** Vendor and trim the MIT-licensed `pi-herdr-subagents` implementation rather than reimplementing its lifecycle, sidecar, session, and rendering ideas. Preserve attribution and record the reviewed upstream revision.
- **Adapters:** Define internal adapters for child-Pi execution, Herdr lifecycle/context, and cyber-mux placement/launch. Keep these adapters behind the orchestration module’s interface.
- **Herdr authority:** Treat Herdr as authoritative for workspace, tab, pane, agent identity, and coarse lifecycle state. Do not maintain an independent Git-wide or pane-wide inventory.
- **cyber-mux authority:** Use cyber-mux for dedicated tab creation, optional worktree provisioning, explicit target identity, launch, and prompt submission. Capture returned IDs; never infer a target from focus or newest-tab order.
- **Invocation:** Workers are created only after explicit delegation. Role descriptions help select named roles but do not trigger automatic spawning.
- **Run shapes:** Support one worker and independent parallel workers. Do not add chains, dependency graphs, task claiming, or shared-team coordination in the first release.
- **Delivery:** Return an acknowledgement immediately. Deliver each worker’s terminal result independently as a custom Pi message that triggers a parent steer turn.
- **Wake policy:** Wake the parent only for completion, failure, cancellation, and explicit child help. Keep normal activity and lifecycle transitions in the widget and human commands.
- **Worker surface:** Create one dedicated Herdr tab per worker, preserve parent focus, use explicit parent workspace identity, and use explicit returned pane IDs.
- **Filesystem:** Use the parent checkout by default. Support explicit worktree isolation through cyber-mux for selected runs or roles.
- **Shared writes:** Shared-checkout mutation is allowed only through an explicit shared-write mode. When multiple mutating workers overlap, show a confirmation warning before launch. Conductor does not merge, reconcile, or repair concurrent edits.
- **Retention:** Never auto-close worker panes. Never automatically delete files, branches, worktrees, or other Git resources.
- **Process lifetime:** Make child Pi auto-exit versus interactive persistence a role policy. Autonomous roles may exit their child Pi process after a turn while their Herdr pane remains open; interactive roles remain at the Pi prompt.
- **Context:** Start workers with isolated context by default. Support an explicit fork or lineage mode when the parent’s prior conversation must be supplied.
- **Roles:** Ship built-in `scout`, `worker`, and `reviewer` roles. Load user-defined roles globally. User definitions override built-ins. Do not load project-local role definitions in the first release.
- **Role policy:** Allow role definitions to set description, system prompt, model, thinking level, tool allowlist/denylist, process lifetime, and optional isolation default. The delegated task remains a separate, unchanged user prompt.
- **Lifecycle:** Represent process state, turn state, pane health, activity health, completion evidence, delivery state, and orphan state separately enough to prevent one uncertain observation from being mistaken for completion.
- **Supervision:** Use Herdr event hooks for normal lifecycle delivery. Run bounded recovery/reconciliation only at parent startup/reload, explicit status/read commands, or when an event/evidence sequence is uncertain. Do not run a continuous one-second polling loop.
- **Evidence:** Use versioned, atomic child activity snapshots for optional detail and a completion sidecar for done/help/error outcomes. Use the child Pi session JSONL as the source for the final assistant response and resume path.
- **Cancellation:** Interrupt the child turn/process, preserve its pane/session/files, mark the worker canceled, and do not auto-retry.
- **Help and resume:** Include child-to-parent `caller_ping` and parent `resume` operations. A help request terminates or pauses the child according to role policy, delivers the question, and allows the parent to resume it with a response.
- **Recovery:** Persist a composite parent identity consisting of Pi session identity and Herdr workspace/tab/pane context. Persist worker session path, workspace/tab/pane identity, task, role, mode, status, timestamps, and delivery state. Update pane identity after Herdr moves. Keep workers running when the parent disappears; mark them orphaned and reattach when the matching parent returns.
- **Failure:** Surface launch, provider, process, event, evidence, and task failures distinctly. Do not retry automatically. Preserve enough session/pane information for explicit resume or inspection.
- **UI:** Render a compact status widget and expandable result/help messages. Add small commands for listing roles, listing workers, reading/focusing a worker, interrupting, resuming, reconciling, and explicit cleanup if cleanup is later added.
- **Package:** Make the extension installable as a normal Pi package. Do not require a separate hand-written skill for the core delegation protocol. Keep Herdr installation and cyber-mux prerequisites explicit.

## Testing Decisions

- Tests cross the highest useful seam: the parent-facing orchestration interface and adapter contracts, not private rendering details or shell implementation minutiae.
- Pure unit tests cover role resolution, exact task preservation, model/tool policy resolution, shared-write confirmation decisions, composite identity, lifecycle projection, event deduplication, sidecar validation, completion classification, result extraction, cancellation state, orphan state, and delivery idempotence.
- Fake-Herdr tests cover explicit target pane selection, dedicated-tab placement, parent-focus preservation, pane moves and returned-ID updates, event-to-parent routing, missed/duplicate/out-of-order events, bounded recovery, launch failures, pane disappearance races, and no-auto-close behavior.
- Fake child-Pi tests cover isolated launch context, role prompt/task separation, auto-exit versus interactive modes, activity sidecar writes, completion sidecar writes, provider-error reporting, `caller_ping`, resume, interruption, and final assistant message extraction.
- Real integration tests run inside Herdr with real Pi child processes and a deterministic authenticated test model or fake provider where feasible. They cover one launch/completion, multiple concurrent launches, dedicated-tab placement, no-focus-stealing, terminal wakeup delivery, cancellation with pane preservation, help/resume, parent reload/orphan reattachment, and optional worktree mode.
- The test suite must assert external behavior: returned run state, Herdr-visible panes, delivered parent messages, preserved resources, and recovered identity. It should not assert incidental command strings when a public adapter result is available.
- Integration tests must clean up their own test fixtures explicitly, without changing the product’s user-facing no-auto-cleanup policy.

## Out of Scope

- Automatic delegation based on descriptions.
- Claude CLI or non-Pi worker backends.
- In-process Pi SDK workers in the first release.
- Direct worker-to-worker messaging.
- Shared task boards, task claiming, dependencies, DAGs, or agent-team semantics.
- Chains and hidden multi-stage workflows.
- Automatic task decomposition.
- Automatic merge, conflict resolution, verification, review, commit, or cleanup instructions.
- Automatic retries.
- Automatic pane closure, worktree removal, branch deletion, or Git cleanup.
- Project-local agent definitions and project-controlled prompts.
- A rich dashboard or full task-management TUI.
- A standalone daemon or separate orchestration service.
- A Git-wide inventory of every worktree or pane.
- Permanent background polling as the normal lifecycle mechanism.
- Replacing Herdr or cyber-mux functionality inside Conductor.

## Further Notes

- The closest prior art is `pi-herdr-subagents` 0.1.5, reviewed at commit `d654eae75ff347ccb618113f2af85f3040d9ade9`. Its async tool contract, dedicated Herdr tabs, role manifests, lifecycle projection, sidecars, session extraction, interrupt behavior, and integration tests should be reused. Its auto-close behavior, continuous polling, broad workflow surface, Claude path, and injected task instructions should not be copied by default.
- The product should remain intentionally opinionated: explicit delegation, parent-mediated workers, visible tabs, open resources, and no automatic Git policy.
- The first implementation phase should be a thin vertical slice: one role, one child Pi in one dedicated Herdr tab, explicit pane targeting, one completion sidecar, one parent wakeup, and one preserved pane. Expand only after that path passes a real Herdr/Pi integration test.
- The durable ledger should be treated as orchestration state, not a source of truth for live pane/worktree facts. Recovery must re-query Herdr and accept its returned identity/status.
- Shared parallel writes are a deliberate power-user mode, not a promise of conflict safety. The confirmation should state that Conductor will not merge or repair changes.
- The research record for the design comparison lives alongside this spec in `research/subagent-systems.md`.
