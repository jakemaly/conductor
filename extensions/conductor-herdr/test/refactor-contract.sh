#!/usr/bin/env bash
set -euo pipefail
root=$(cd "$(dirname "$0")/.." && pwd)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
cat >"$tmp/herdr" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "$HERDR_CALLS"
EOF
chmod +x "$tmp/herdr"
export HERDR_BIN_PATH="$tmp/herdr"
export HERDR_PLUGIN_STATE_DIR="$tmp/state"
export HERDR_CALLS="$tmp/calls"
unset HERDR_WORKSPACE_ID HERDR_TAB_ID HERDR_PANE_ID HERDR_PLUGIN_CONTEXT_JSON

skill="$root/../../SKILL.md"
grep -Fq "PARENT_PANE=\$(cyber-mux doctor --format json | jq -er '.pane')" "$skill" || {
  echo 'skill does not capture the parent pane explicitly' >&2
  exit 1
}
grep -Fq 'CYBER_MUX=herdr CYBER_MUX_PANE="$PARENT_PANE"' "$skill" || {
  echo 'skill does not anchor the first worker to the parent pane' >&2
  exit 1
}

# Registration requires explicit parent context and stores only the worker bridge.
HERDR_WORKSPACE_ID=repo HERDR_TAB_ID=repo:t1 HERDR_PANE_ID=conductor:p1 \
  node "$root/bin/conductor-herdr.mjs" register \
  stage-1 worker:p1 /repo/.worktrees/stage-1 conductor/stage-1 >/dev/null
node - <<'EOF'
const fs = require('node:fs');
const s = JSON.parse(fs.readFileSync(process.env.HERDR_PLUGIN_STATE_DIR + '/conductor.json'));
const w = s.workers['repo:worker:p1'];
if (!w || w.parent_pane !== 'conductor:p1' || w.worktree !== '/repo/.worktrees/stage-1') throw new Error('registration lost parent/worker mapping');
if (s.workspaces) throw new Error('old inventory state leaked into the bridge');
EOF

# Concurrent registrations must not overwrite one another.
for attempt in $(seq 1 10); do
  rm -rf "$HERDR_PLUGIN_STATE_DIR"; mkdir -p "$HERDR_PLUGIN_STATE_DIR"
  HERDR_WORKSPACE_ID=repo HERDR_TAB_ID=repo:t1 HERDR_PANE_ID=conductor:p1 \
    node "$root/bin/conductor-herdr.mjs" register \
    parallel-a worker:a /repo/.worktrees/a conductor/parallel-a >/dev/null &
  pid_a=$!
  HERDR_WORKSPACE_ID=repo HERDR_TAB_ID=repo:t1 HERDR_PANE_ID=conductor:p1 \
    node "$root/bin/conductor-herdr.mjs" register \
    parallel-b worker:b /repo/.worktrees/b conductor/parallel-b >/dev/null &
  pid_b=$!
  wait "$pid_a" "$pid_b"
  node - <<'EOF'
const fs = require('node:fs');
const s = JSON.parse(fs.readFileSync(process.env.HERDR_PLUGIN_STATE_DIR + '/conductor.json'));
if (!s.workers['repo:worker:a'] || !s.workers['repo:worker:b']) throw new Error('concurrent registration lost a worker');
EOF
done

# A terminal event wakes the explicit parent and records Herdr's status.
rm -rf "$HERDR_PLUGIN_STATE_DIR"; mkdir -p "$HERDR_PLUGIN_STATE_DIR"
HERDR_WORKSPACE_ID=repo HERDR_TAB_ID=repo:t1 HERDR_PANE_ID=conductor:p1 \
  node "$root/bin/conductor-herdr.mjs" register \
  stage-1 worker:p1 /repo/.worktrees/stage-1 conductor/stage-1 >/dev/null
export HERDR_PLUGIN_EVENT_JSON='{"event":"pane.agent_status_changed","data":{"workspace_id":"repo","pane_id":"worker:p1","agent_status":"idle","revision":7}}'
node "$root/bin/conductor-herdr.mjs" event
if ! grep -q '^agent send conductor:p1 ' "$HERDR_CALLS"; then echo 'missing parent wakeup' >&2; exit 1; fi
if ! grep -q '^pane send-keys conductor:p1 enter$' "$HERDR_CALLS"; then echo 'parent wakeup was not submitted' >&2; exit 1; fi
node - <<'EOF'
const fs = require('node:fs');
const s = JSON.parse(fs.readFileSync(process.env.HERDR_PLUGIN_STATE_DIR + '/conductor.json'));
if (s.workers['repo:worker:p1'].status !== 'idle') throw new Error('status event was not recorded');
EOF

# Duplicate terminal/exited events do not wake the parent twice.
export HERDR_PLUGIN_EVENT_JSON='{"event":"pane.exited","data":{"workspace_id":"repo","pane_id":"worker:p1"}}'
node "$root/bin/conductor-herdr.mjs" event
sends=$(grep -c '^agent send conductor:p1 ' "$HERDR_CALLS")
if [ "$sends" -ne 1 ]; then echo 'duplicate terminal event woke parent' >&2; exit 1; fi
node - <<'EOF'
const fs = require('node:fs');
const s = JSON.parse(fs.readFileSync(process.env.HERDR_PLUGIN_STATE_DIR + '/conductor.json'));
if (!s.workers['repo:worker:p1'].pane_exited_at) throw new Error('pane exit was not recorded');
EOF

# An unexpected exit wakes the parent as unknown and leaves the worker mapping.
rm -rf "$HERDR_PLUGIN_STATE_DIR"; mkdir -p "$HERDR_PLUGIN_STATE_DIR"
HERDR_WORKSPACE_ID=repo HERDR_TAB_ID=repo:t1 HERDR_PANE_ID=conductor:p1 \
  node "$root/bin/conductor-herdr.mjs" register \
  stage-1 worker:p1 /repo/.worktrees/stage-1 conductor/stage-1 >/dev/null
: > "$HERDR_CALLS"
export HERDR_PLUGIN_EVENT_JSON='{"event":"pane.exited","data":{"workspace_id":"repo","pane_id":"worker:p1"}}'
node "$root/bin/conductor-herdr.mjs" event
if ! grep -q 'unknown' "$HERDR_CALLS"; then echo 'unexpected exit did not wake parent' >&2; exit 1; fi

# Missing explicit context must fail rather than guess a focused pane/workspace.
rm -rf "$HERDR_PLUGIN_STATE_DIR"; mkdir -p "$HERDR_PLUGIN_STATE_DIR"
if node "$root/bin/conductor-herdr.mjs" register stage-1 worker:p1 /repo/.worktrees/stage-1 conductor/stage-1 >/dev/null 2>&1; then
  echo 'registration guessed missing context' >&2
  exit 1
fi

echo 'sub-agent bridge contract: ok'
