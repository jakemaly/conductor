#!/usr/bin/env bash
set -euo pipefail
root=$(cd "$(dirname "$0")/.." && pwd)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
cat >"$tmp/herdr" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
case "$1 $2" in
  "api snapshot")
    printf '%s\n' '{"result":{"snapshot":{"focused_pane_id":"wrong:p1","focused_workspace_id":"wrong","focused_tab_id":"wrong:t1","panes":[{"pane_id":"worker:p1","workspace_id":"repo","tab_id":"repo:t1","cwd":"/repo","agent_status":"idle"}]}}}'
    ;;
  *) printf '%s\n' "$*" >> "$HERDR_CALLS" ;;
esac
EOF
chmod +x "$tmp/herdr"
export HERDR_BIN_PATH="$tmp/herdr"
export HERDR_PLUGIN_STATE_DIR="$tmp/state"
export HERDR_CALLS="$tmp/calls"

# Explicit registration must create workspace-scoped state.
HERDR_WORKSPACE_ID=repo HERDR_TAB_ID=repo:t1 HERDR_PANE_ID=conductor:p1 \
  node "$root/bin/conductor-herdr.mjs" register \
  stage-1 worker:p1 /repo/.worktrees/stage-1 conductor/stage-1 crew:p1
node - <<'EOF'
const fs = require('node:fs');
const s = JSON.parse(fs.readFileSync(process.env.HERDR_PLUGIN_STATE_DIR + '/conductor.json'));
const w = s.workspaces?.repo;
if (!w || w.conductor_pane !== 'conductor:p1' || w.crew_anchor !== 'crew:p1') throw new Error('registration is not workspace-scoped');
if (w.tasks['stage-1']?.status !== 'working') throw new Error('registration did not create working task');
EOF

# Reconciliation must not invent a workspace from focused global state.
rm -rf "$HERDR_PLUGIN_STATE_DIR"; mkdir -p "$HERDR_PLUGIN_STATE_DIR"
node "$root/bin/conductor-herdr.mjs" reconcile
node - <<'EOF'
const fs = require('node:fs');
const s = JSON.parse(fs.readFileSync(process.env.HERDR_PLUGIN_STATE_DIR + '/conductor.json'));
if (Object.keys(s.workspaces || {}).length !== 0) throw new Error('reconcile guessed focused workspace');
EOF

# Event wakeup must submit text, not leave it queued.
HERDR_WORKSPACE_ID=repo HERDR_TAB_ID=repo:t1 HERDR_PANE_ID=conductor:p1 \
  node "$root/bin/conductor-herdr.mjs" register \
  stage-1 worker:p1 /repo/.worktrees/stage-1 conductor/stage-1 crew:p1
export HERDR_PLUGIN_EVENT_JSON='{"event":"pane.agent_status_changed","data":{"workspace_id":"repo","pane_id":"worker:p1","agent_status":"idle","revision":7}}'
node "$root/bin/conductor-herdr.mjs" event
if ! grep -q '^agent send conductor:p1 ' "$HERDR_CALLS"; then echo 'missing wakeup text' >&2; exit 1; fi
if ! grep -q '^pane send-keys conductor:p1 enter$' "$HERDR_CALLS"; then echo 'wakeup text was not submitted' >&2; exit 1; fi

# A later idle snapshot must not erase the terminal event.
node "$root/bin/conductor-herdr.mjs" reconcile
node - <<'EOF'
const fs = require('node:fs');
const s = JSON.parse(fs.readFileSync(process.env.HERDR_PLUGIN_STATE_DIR + '/conductor.json'));
if (s.workspaces.repo.tasks['stage-1'].status !== 'idle') throw new Error('reconcile downgraded completed idle to another state');
EOF

# Closing a completed pane must not replace its completion with unknown.
export HERDR_PLUGIN_EVENT_JSON='{"event":"pane.exited","data":{"workspace_id":"repo","pane_id":"worker:p1"}}'
node "$root/bin/conductor-herdr.mjs" event
node - <<'EOF'
const fs = require('node:fs');
const s = JSON.parse(fs.readFileSync(process.env.HERDR_PLUGIN_STATE_DIR + '/conductor.json'));
if (s.workspaces.repo.tasks['stage-1'].status !== 'idle') throw new Error('pane exit downgraded completed task');
const calls = fs.readFileSync(process.env.HERDR_CALLS, 'utf8').split('\n').filter(Boolean);
if (calls.filter((call) => call.startsWith('agent send conductor:p1 ')).length !== 1) throw new Error('pane exit sent duplicate wakeup');
EOF

echo 'refactor contract: ok'
