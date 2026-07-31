# Conductor

Delegate named tasks to Pi sub-agents in isolated Git worktrees.

## Dependencies

- Pi inside Herdr with its integration enabled
- Herdr-backed `cyber-mux`
- Enabled `conductor.herdr` plugin
- A Git repository/worktree

## Use case

Use it when independent tasks can be handled by separate Pi agents. Each gets
its own pane, worktree, and `conductor/<name>` branch.

## How to use

Ask in natural language, for example: `Spawn two agents: one handles the API
and one handles the UI.` Conductor launches them and leaves their panes and
worktrees available for inspection or integration.
