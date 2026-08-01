# Upstream baseline

This directory vendors `pi-herdr-subagents` as a runnable reference baseline for Conductor.

- Source: https://github.com/0xRichardH/pi-herdr-subagents
- Reviewed revision: `d654eae75ff347ccb618113f2af85f3040d9ade9`
- Package version: `0.1.5`
- License: MIT; see `LICENSE`

The vendored code is intentionally unadapted at this stage. Conductor-specific policy changes are tracked separately against the approved specification.

## Baseline validation

From the package directory on 2026-08-01:

- `npm ci` — passed; npm reported two existing dependency audit findings (one moderate, one high).
- `npm test` — passed.
- `npm run lint` — passed.
- `npm pack --dry-run` — passed; package metadata and extension entrypoint were included.
- `pi install ./extensions/pi-herdr-subagents` — passed from an isolated project directory.
- `npm run test:integration` — not run; it requires an authenticated test model and creates temporary Herdr workspaces/panes. The command is documented in the vendored README for an explicit Herdr run.
