# Conductor

Conductor delegates named tasks to Pi sub-agents running in isolated Git worktrees.

## Dependencies

- Pi running inside Herdr
- Herdr with the Pi integration enabled
- `cyber-mux` configured for Herdr
- `conductor.herdr` plugin enabled
- A Git worktree

## Use case

Use it when independent tasks can be handled by separate Pi agents.
Each agent gets its own pane, worktree, and `conductor/<name>` branch.

## Use

Ask for delegation in natural language, for example:

```text
Spawn two agents: one handles the API and one handles the UI.
```

Conductor launches the workers and reports their results. Worktrees and panes
remain available for inspection or integration.
