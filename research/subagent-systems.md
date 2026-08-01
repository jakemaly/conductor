# Subagent system research

Research date: 2026-07-31

Question: how to turn Conductor from a skill-plus-Herdr bridge into a lightweight, robust Pi subagent system without rebuilding Herdr or cyber-mux.

## Current Conductor

The current product has two seams:

- `SKILL.md` teaches the parent model to run `cyber-mux worktree add`, `cyber-mux submit`, and a registration command. The dispatch protocol is prose executed through the parent model's shell tool.
- `extensions/conductor-herdr/bin/conductor-herdr.mjs` is a 186-line event bridge. It registers a worker mapping, persists it in a small JSON ledger, consumes `pane.agent_status_changed`/`pane.exited`, deduplicates events, and sends a completion message back to the parent pane.

The graph/code pass found one implementation module containing the durable state and event bridge (`withState`, `register`, `event`, `invocationContext`, `call`). It does not own delegation, agent definitions, task state, result collection, or a user-facing orchestration interface.

## Primary-source findings

### Pi

Pi explicitly leaves subagents out of core and expects workflows to be built as extensions or packages. Its extension interface can register tools, commands, shortcuts, lifecycle handlers, custom renderers, and persistent session entries. Relevant lifecycle hooks include `agent_start`, `agent_end`, `agent_settled`, `session_start`, `session_shutdown`, and tool execution events.

Pi's official subagent example already supplies the missing product shape:

- one `subagent` tool with single, parallel, and chain modes;
- named Markdown agent definitions with `name`, `description`, optional `tools`, and optional `model`;
- user/project agent scopes, with an explicit confirmation before running project-local agents;
- child `pi --mode json -p --no-session` processes, isolated context windows, streamed output, usage accounting, and abort propagation;
- bounded parallelism (8 requested tasks, 4 concurrent in the example) and `{previous}` result passing for chains;
- compact default rendering with expanded detail on demand.

Pi's SDK separately supports in-process `AgentSession` instances with subscriptions, prompts, model/tool selection, custom resources, and in-memory sessions. Pi's own SDK docs describe RPC as the preferred alternative when process isolation or language-agnostic integration is wanted.

**Implication:** a Pi extension can provide a real typed `delegate` interface and reuse the proven child-Pi runner pattern. It does not need to fork Pi or introduce a daemon. In-process SDK sessions are a second adapter for hidden/read-only work, not a prerequisite for visible Herdr panes.

Sources:

- Pi README, local installed docs: `/home/jake/.hermes/node/lib/node_modules/@earendil-works/pi-coding-agent/README.md` (Customization, Programmatic Usage, Philosophy).
- Pi extensions API: `/home/jake/.hermes/node/lib/node_modules/@earendil-works/pi-coding-agent/docs/extensions.md`.
- Pi SDK: `/home/jake/.hermes/node/lib/node_modules/@earendil-works/pi-coding-agent/docs/sdk.md`.
- Official example: `/home/jake/.hermes/node/lib/node_modules/@earendil-works/pi-coding-agent/examples/extensions/subagent/README.md` and `index.ts`.
- Official repository mirror: https://github.com/earendil-works/pi-mono/tree/main/packages/coding-agent/examples/extensions/subagent

### Claude Code subagents

Claude Code's official subagent model uses Markdown definitions with required `name` and `description`, plus optional model, tool allow/deny lists, permission mode, max turns, skills, hooks, memory, background execution, and worktree isolation. Definitions can be project-, user-, plugin-, managed-, CLI-, or session-scoped. The description is part of delegation: Claude uses it to decide when a specialized agent matches.

Each subagent has an independent context window and returns its result to the caller. The design treats context preservation, capability restriction, model/cost routing, and reusable role definitions as first-class concerns.

Claude distinguishes this from agent teams. Teams add direct teammate-to-teammate messaging, a shared task list with dependencies/claiming, a lead, and optional split-pane display. Teams are experimental, cost more, and add coordination overhead; ordinary subagents are the better fit when workers only need to do a focused task and report back.

**Implication:** copy the named-agent definition and capability-control ideas, not the full team system. Start with parent-mediated subagents; add direct messaging/shared tasks only if a concrete workflow proves it needs them.

Sources:

- https://docs.anthropic.com/en/docs/claude-code/sub-agents
- https://code.claude.com/docs/en/sub-agents
- https://code.claude.com/docs/en/agent-teams

### Codex subagents

OpenAI's official Codex documentation describes subagent workflows as isolated agent threads spawned for independent work, often in parallel, with consolidated results returned to the primary thread. It recommends parallel work for read-heavy exploration, tests, triage, and review, and warns that write-heavy parallelism creates conflicts.

Codex also uses named custom agent files with a description and developer instructions, plus optional model, reasoning effort, sandbox, MCP, and skill configuration. Global settings include a per-session concurrency cap and default subagent model/effort.

**Implication:** the durable product primitives are small: named role, task, isolated execution, bounded concurrency, cancellation, and a concise result envelope. The rest is policy and adapters.

Source:

- https://developers.openai.com/codex/concepts/subagents

### Herdr

Herdr's official plugin documentation says a plugin is an executable package, not an SDK integration. Herdr owns panes, workspaces, events, invocation context, and the CLI/socket API; the plugin owns its implementation and durable state. Plugins receive workspace/tab/pane context through environment variables and `HERDR_PLUGIN_CONTEXT_JSON`, and can call the full Herdr CLI through `HERDR_BIN_PATH`.

Herdr's automation documentation separates responsibilities:

- layout owns workspace/tab/pane topology;
- panes control raw terminals and input/output;
- agents expose recognized agent identity and lifecycle states.

Herdr provides event-driven `agent.wait`/`agent.prompt`, pane movement, agent reads, state reporting, and socket subscriptions. A moved running pane keeps its process alive but can receive a new public pane ID across workspaces; callers must use the returned ID. Herdr's plugin startup hooks are one-shot initialization, not supervised daemons. Plugin state remains plugin-owned.

**Implication:** keep Herdr as the runtime/layout adapter and lifecycle authority. A Conductor Pi extension may call a tiny helper/plugin for events, but should not duplicate Herdr's pane/agent model or become a second supervisor.

Sources:

- https://herdr.dev/docs/plugins/
- https://herdr.dev/docs/agent-automation/
- https://herdr.dev/docs/socket-api/

### cyber-mux

cyber-mux describes itself as a narrow cross-multiplexer pane seam. Its contract detects a mux and drives panes; its worktree command combines Git worktree creation with opening the result. The official README explicitly says it drives panes and nothing else.

**Implication:** leave worktree creation, pane targeting, layout, launch, and submission in cyber-mux. Conductor should pass an explicit caller/target identity and consume returned IDs; it should not grow a second pane-placement implementation.

Source:

- https://github.com/cyberuni/cyber-mux
- Local installed source: `/home/jake/.hermes/node/lib/node_modules/cyber-mux/src/`

### `pi-herdr-subagents` reference implementation

`pi-herdr-subagents` is the closest existing implementation to the desired product. jsDelivr lists version `0.1.5`, MIT licensed, with a Pi package manifest whose only extension entrypoint is `pi-extension/subagents/index.ts`.

Its strongest ideas are worth adopting:

- **Async parent contract:** `subagent` launches a worker and returns immediately. Completion is sent back as a custom Pi message with `triggerTurn: true` and `deliverAs: "steer"`, so the parent can continue working and is woken only when a result arrives.
- **Dedicated visible Herdr surface:** the extension creates a new Herdr tab per worker, explicitly targets the returned pane ID, and avoids focus stealing. This matches the no-worktree/default-shared-checkout direction better than the current Conductor skill.
- **Named role manifests:** project, global, and bundled `.md` agents can set model, thinking, tools, skills, session mode, spawn permissions, auto-exit, interactivity, cwd, and hidden/direct-invocation policy.
- **Real lifecycle projection:** Herdr is the coarse authority (`idle`, `working`, `blocked`, `done`, `unknown`); a child Pi extension writes a versioned, atomically-renamed activity sidecar with sequence numbers and tool/provider/turn detail. A lifecycle module separates process state, turn state, pane health, activity health, completion detection, and delivery state.
- **Completion evidence:** it uses a child-written `.exit` sidecar for `done`, `ping`, and provider errors, plus a terminal sentinel fallback. It extracts the final assistant message from the child session JSONL and preserves the session path for inspection/resume.
- **Cancellation semantics:** `subagent_interrupt` sends Escape to the child turn and intentionally keeps the pane, session, watcher, and running entry alive. This is close to our selected “stop process, keep pane” behavior.
- **Human controls and UI:** tools cover spawn, interrupt, list definitions, and resume; commands cover `/subagent`, `/iterate`, and `/plan`; a compact widget shows active/open workers and can render detailed status/results.
- **Runtime correctness:** it validates exact authenticated model references, supported thinking levels, tool allowlists, and parent/child runtime mismatches; it has tests for routing, lifecycle, mux surfaces, and real integration flows.

Important differences and warnings:

- It **polls** Herdr pane state and activity files once per second in the parent. That is pragmatic and testable, but conflicts with our event-driven preference; use Herdr event subscriptions or a narrowly-scoped wait primitive before copying this wholesale.
- It **auto-closes panes** in `watchSubagent()` after completion. We explicitly chose to keep panes open, so adopt the lifecycle/result machinery without that cleanup behavior.
- Its child launch injects mode hints and a “final assistant message should summarize” instruction, and it exposes `subagent_done`/`caller_ping`. Our current decision is to pass the task exactly as written; treat these as optional protocol choices, not defaults.
- It keeps live run state in a process-global registry to survive `/reload`, but does not provide a durable run ledger for a parent process restart. Its `subagent_resume` operates from a saved session path rather than reattaching a durable orchestration record.
- It has accumulated a broad surface (Pi and Claude CLI paths, fork/lineage modes, plan/iterate workflows, status projections, model catalog routing). This is useful evidence, not a v1 scope to copy.

**Implication:** use this package as the implementation baseline for the Pi extension seam—async fire-and-forget tool, pane identity, structured lifecycle, sidecars, session extraction, interrupt, compact rendering, and role manifests. Deliberately remove its auto-close policy, avoid its Claude path and workflow commands initially, and decide whether event-driven Herdr subscriptions can replace its polling watcher.

Sources:

- Package page: https://www.jsdelivr.com/package/npm/pi-herdr-subagents
- Repository: https://github.com/0xRichardH/pi-herdr-subagents
- Reviewed commit: https://github.com/0xRichardH/pi-herdr-subagents/tree/d654eae75ff347ccb618113f2af85f3040d9ade9
- Key files: `pi-extension/subagents/index.ts`, `herdr.ts`, `lifecycle.ts`, `activity.ts`, `completion.ts`, `session.ts`, `subagent-done.ts`, and `test/integration/subagent-lifecycle.test.ts`.

## Design synthesis (hypothesis, not an approved plan)

The deepest useful seam appears to be a **Pi extension orchestration module**:

```text
parent Pi
  └─ typed delegate tool + /agents commands + compact task UI
       ├─ named agent registry (Markdown definitions)
       ├─ task/run state and result envelopes
       ├─ child-Pi runner (isolated context; visible worker)
       ├─ optional in-process SDK runner (hidden/read-only worker later)
       └─ Herdr/cyber-mux adapter (pane/worktree/layout/lifecycle)
```

The initial interface should probably be one deep operation, conceptually:

```text
delegate({ agent?, task, tasks?, mode?, cwd?, placement? }) -> run summary
```

The implementation can hide process launch, pane anchoring, registration, event routing, cancellation, result capture, and persistence. A user-facing command can expose inspection/control without making the model reconstruct shell choreography.

A conservative first capability set is:

1. named agents with role description, model, tool allowlist, and optional system prompt;
2. explicit single and bounded-parallel delegation;
3. isolated child Pi workers in Herdr panes when requested/available;
4. parent-only completion summaries and direct worker reads;
5. durable run/worker mapping keyed by Pi session plus Herdr workspace/pane identity;
6. event-driven completion and cancellation, with no polling loop;
7. no automatic merge, verification, cleanup, or task decomposition unless explicitly added as policy.

Do not add direct worker messaging, shared dependency graphs, auto-delegation, background daemon supervision, or in-process SDK workers until a real workflow requires them.

## Decisions to grill next

1. Where should orchestration authority live: Pi extension, Herdr plugin, or a separate daemon?
2. Are visible Herdr panes a required product behavior, or only one execution/display adapter?
3. Is delegation explicit-only, or should the parent model auto-route by agent descriptions?
4. What is the smallest stable task/result contract: single + parallel, or chains too?
5. Should workers be allowed to edit by default, and what is the isolation/permission policy?
6. What must survive a parent restart: mappings only, full run state, or resumable sessions?
7. Which control surface is required first: one LLM tool, slash commands, a panel, or all three?

Until those decisions are answered, implementation would be premature.
