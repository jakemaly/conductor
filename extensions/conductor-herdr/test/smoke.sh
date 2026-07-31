#!/usr/bin/env bash
set -euo pipefail
root=$(cd "$(dirname "$0")/.." && pwd)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
cat >"$tmp/herdr" <<'EOF'
#!/usr/bin/env bash
if [[ "$1 $2" == "api snapshot" ]]; then
  printf '%s\n' '{"result":{"snapshot":{"focused_pane_id":"conductor","focused_workspace_id":"w1","focused_tab_id":"t1","panes":[{"pane_id":"worker","agent_status":"working","cwd":"/tmp/work","workspace_id":"w1","tab_id":"t1"}]}}}'
else
  printf '%s\n' "$*" >> "$HERDR_CALLS"
fi
EOF
chmod +x "$tmp/herdr"
export HERDR_BIN_PATH="$tmp/herdr"
export HERDR_PLUGIN_STATE_DIR="$tmp/state"
node "$root/bin/conductor-herdr.mjs" reconcile
node - <<'EOF'
const fs = require('node:fs');
const p = process.env.HERDR_PLUGIN_STATE_DIR + '/conductor.json';
const s = JSON.parse(fs.readFileSync(p));
s.tasks.build = {stage:'build', pane:'worker', worktree:'/tmp/work', status:'working'};
fs.writeFileSync(p, JSON.stringify(s));
EOF
export HERDR_PLUGIN_EVENT_JSON='{"event":"pane.agent_status_changed","data":{"pane_id":"worker","agent_status":"done","revision":7}}'
export HERDR_CALLS="$tmp/calls"
node "$root/bin/conductor-herdr.mjs" event
node - <<'EOF'
const fs = require('node:fs');
const s = JSON.parse(fs.readFileSync(process.env.HERDR_PLUGIN_STATE_DIR + '/conductor.json'));
if (s.tasks.build.status !== 'done') throw new Error('event did not persist done');
if (!fs.readFileSync(process.env.HERDR_CALLS, 'utf8').includes('agent send conductor')) throw new Error('event did not wake conductor');
EOF
echo 'conductor-herdr smoke: ok'
