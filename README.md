# Conductor
Ask: `Spawn two agents: one handles the API and one handles the UI.`

Delegate independent tasks to Pi sub-agents in isolated Git worktrees.

## Dependencies
- [Pi](https://github.com/earendil-works/pi) inside Herdr
- [Herdr](https://herdr.dev) with its Pi integration
- [cyber-mux](https://github.com/cyberuni/cyber-mux)
- The `conductor.herdr` plugin
- A Git repository/worktree

## Install
```bash
npm install -g --ignore-scripts @earendil-works/pi-coding-agent
curl -fsSL https://herdr.dev/install.sh | sh
npm install -g cyber-mux
herdr plugin link ./extensions/conductor-herdr
```
