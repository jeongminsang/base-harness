# Base Harness

Self-enforcing harness for AI-assisted development. The shared core owns rules, memory, skills, and verification gates. Each AI coding assistant (OMC, OMO, OMX, Codex) gets a thin adapter layer.

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

The installer keeps `bootstrap.sh` as the single entrypoint and lets you install `omc`, `omo`, `omx`, `codex`, or `all`.

## What Gets Installed

```text
your-repo/
├── hooks/            # Shared enforcement scripts
│   └── git/          # Git hook files (pre-commit)
├── agents/           # Shared personas
├── memory/
│   └── project-memory.json # Mined skill meta facts
├── skills/           # Pattern library
└── AGENTS.md         # Shared operator contract
```

Note: Optional adapter configurations like `.claude/`, `.opencode/`, `.omx/`, or `.codex/` will be created depending on the installed adapters.

## Quickstart

### OMC / OMO / OMX

1. Install with the `omc`, `omo`, `omx`, or `all` adapter option.
2. Open the AI coding assistant in the repo.
3. The assistant reads `.claude/settings.json`, `.opencode/settings.json`, or `.omx/settings.json` and runs the shared hook pipeline automatically.

### Codex

1. Install with the `codex` or `all` adapter option.
2. Before major work, run:
   ```bash
   ./.codex/commands/preflight.sh "task summary"
   ```
3. After finishing, run:
   ```bash
   ./.codex/commands/final-check.sh
   ```

## Commit Gate

Deterministic checks (L3 scan → tsc → eslint) are enforced automatically via Stop hook and git pre-commit. No verification state files are written or reviewed by models — a gate the model can write is a gate the model will rubber-stamp; only checks the model cannot forge (regex scan, tsc, eslint, fresh-context review) act as gates.

Scoping: the Stop hook only gates files changed during the session (a SessionStart baseline excludes pre-existing user WIP), and pre-commit validates staged (index) content so partial staging is checked against what actually gets committed.

## Skill Injection

`pre-task.cjs` injects matching skills as `additionalContext` on Write/Edit. Each skill is injected at most once per session (deduplicated via `.omc/state/injected-skills.json`), keeping token usage flat across long sessions. Auto-mined `.draft.md` files are never injected — a human promotes a draft by renaming it to `.md` (DRAFT-FIRST).

Note: injection relies on `PreToolUse` `additionalContext` support, which requires a recent Claude Code version — on older versions injection is silently skipped (enforcement gates are unaffected).

## Update

Re-run `bootstrap.sh`. It is safe for update mode:

- Existing `.claude/settings.json`, `.opencode/settings.json`, `.omx/settings.json` files keep non-hook settings and get only the hook section refreshed.
- Existing `AGENTS.md` files prompt before regeneration.
- Re-running Codex install refreshes `.codex/commands/*` deterministically.
- `hooks/lib/l3-local.cjs` (project-owned L3/L2 rules — the promotion ladder target) is never overwritten. `hooks/lib/l3-preset.cjs` is refreshed; if it was locally modified, a `.bak` backup is saved first.

## Docs

- [ARCHITECTURE.md](./ARCHITECTURE.md)
- [templates/AGENTS.md.tpl](./templates/AGENTS.md.tpl)
