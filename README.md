# Conductor
A simple, terminal-multiplexed subagent skill+extension for isolated Git worktrees.

## Install
- Pi.dev inside Herdr
```bash
npm install -g --ignore-scripts @earendil-works/pi-coding-agent
curl -fsSL https://herdr.dev/install.sh | sh
```

- cyber-mux
```bash
npm install -g cyber-mux
```
- Conductor
```bash
git clone https://github.com/jakemaly/conductor.git ~/.conductor
herdr plugin link ~/.conductor/extensions/conductor-herdr
```

## How to Use
Ask: `Spawn N subagents to handle the API and the UI.`

The agents will spawn in new herdr panes, begin working, and report back to the main conductor session with their findings.

## Reference baseline
The vendored `extensions/pi-herdr-subagents` package is the unadapted upstream baseline used for Conductor’s redesign. From a clean checkout:

```bash
npm ci --prefix extensions/pi-herdr-subagents
npm test --prefix extensions/pi-herdr-subagents
npm run lint --prefix extensions/pi-herdr-subagents
pi install ./extensions/pi-herdr-subagents
```

See `extensions/pi-herdr-subagents/UPSTREAM.md` for the reviewed revision and license attribution.
