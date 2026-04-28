# Base Harness

Self-enforcing harness for AI-assisted development. Hooks enforce code quality at write-time, agent personas provide role separation, and a skill system captures learned patterns.

## Prerequisites

- Node.js >= 18
- Git repository

## Install

```bash
# Remote (curl)
curl -sSL https://raw.githubusercontent.com/jeongminsang/base-harness/main/bootstrap.sh | bash

# Local (from this repo)
bash harness/bootstrap.sh
```

The installer asks 6 questions and wires everything up in ~30 seconds.

## What Gets Installed

```
your-repo/
├── hooks/           # Quality enforcement hooks (Node.js, zero-dep)
├── agents/          # Agent persona definitions
├── memory/          # Debate ledger + notepad + project facts
├── skills/          # Pattern library (grows over time)
├── AGENTS.md        # Agent coordination rules
└── .claude/
    └── settings.json  # Hook registration
```

## Quickstart (after install)

1. Open your AI coding agent in the project
2. Start coding — hooks fire automatically on every Write/Edit
3. When a new page/component is needed, the debate protocol activates:
   ```
   [PROPOSED round created]
   → spawn critic Agent() → CHALLENGED
   → analyst confirms → CONSENSUS
   → executor writes file
   ```
4. Skills accumulate as `*.draft.md` files; promote them by renaming to `*.md`

## Customization

### Stack Preset

Set in `hooks/config.json`:
```json
{ "preset": "vite" }
```

Available presets: `vite`, `vanilla-ts`  
Custom preset: create `harness/presets/<name>/l3-rules.cjs`

### ARCH-TRIGGER Paths

Files that require debate before creation:
```json
{ "archTriggerPaths": ["src/pages/", "src/components/"] }
```

### Build / Lint Commands

```json
{
  "buildCheckCmd": "yarn tsc --noEmit",
  "lintCmd": "npx eslint"
}
```

## Update

Re-run the installer — it detects existing install and offers update mode:
```bash
bash harness/bootstrap.sh
```

Or pull latest hooks manually:
```bash
cp harness/templates/hooks/*.cjs hooks/
cp harness/templates/hooks/lib/*.cjs hooks/lib/
```

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for a deep-dive into every component.
