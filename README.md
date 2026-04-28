# Base Harness

Self-enforcing harness for AI-assisted development. The shared core owns rules, memory, skills, debate state, and verification gates. Claude and Codex each get a thin adapter layer.

## Prerequisites

- Node.js >= 18
- Git repository

## Install

```bash
# Remote
curl -sSL https://raw.githubusercontent.com/jeongminsang/base-harness/main/bootstrap.sh | bash

# Local
bash bootstrap.sh
```

The installer keeps `bootstrap.sh` as the single entrypoint and lets you install `claude`, `codex`, or `both`.

## What Gets Installed

```text
your-repo/
├── hooks/            # Shared enforcement scripts
├── agents/           # Shared personas
├── memory/           # Debate ledger + notepad + project facts
├── skills/           # Pattern library
├── state/            # Canonical verifier artifact location
├── AGENTS.md         # Shared operator contract
├── .claude/          # Claude adapter: automatic hooks
└── .codex/           # Codex adapter: explicit commands
```

## Quickstart

### Claude

1. Install with the `claude` or `both` adapter option.
2. Open Claude Code in the repo.
3. Claude reads `.claude/settings.json` and runs the shared hook pipeline automatically.

### Codex

1. Install with the `codex` or `both` adapter option.
2. Before substantial work, run:
   ```bash
   ./.codex/commands/preflight.sh "task summary"
   ```
3. After substantial edits, run:
   ```bash
   ./.codex/commands/post-task.sh
   ```
4. After verification, record the verified files and run the final gate:
   ```bash
   ./.codex/commands/mark-verified.sh src/example.ts src/example.test.ts
   ./.codex/commands/final-check.sh
   ```

## Canonical Verification State

The canonical success marker is `state/verified-complete.json`.

During migration, the harness still accepts the legacy `.omc/state/verified_complete.json` file if it already exists, but new installs and new verifier writes should use `state/verified-complete.json`.

## Update

Re-run `bootstrap.sh`. It is safe for update mode:

- Existing `.claude/settings.json` files keep non-hook settings and get only the hook section refreshed.
- Existing `AGENTS.md` files prompt before regeneration.
- Re-running Codex install refreshes `.codex/commands/*` deterministically.

## Docs

- [ARCHITECTURE.md](./ARCHITECTURE.md)
- [templates/AGENTS.md.tpl](./templates/AGENTS.md.tpl)
