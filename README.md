# Claude Code Harness

Self-enforcing AI harness for Claude Code projects. Hooks enforce code quality at write-time, agent personas provide role separation, and a skill system captures learned patterns.

## Prerequisites

- Node.js >= 18
- Git repository
- [Claude Code](https://claude.ai/code) CLI

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
├── hooks/           # Claude Code hooks (Node.js, zero-dep)
├── agents/          # Agent persona definitions
├── memory/          # Debate ledger + notepad + project facts
├── skills/          # Pattern library (grows over time)
├── AGENTS.md        # Agent coordination rules
└── .claude/
    └── settings.json  # Hook registration
```

## Quickstart (after install)

1. Open Claude Code in your project
2. Start coding — hooks fire automatically on every Write/Edit
3. When a new page/component is needed, the debate protocol activates:
   ```
   [Claude creates PROPOSED round]
   → spawn critic Agent() → CHALLENGED
   → analyst confirms → CONSENSUS
   → executor writes file
   ```
4. Skills accumulate as `*.draft.md` files; promote them by renaming to `*.md`

## Customization

### Stack Preset

Set in `hooks/config.json`:
```json
{ "preset": "react-ts" }
```

Available presets: `react-ts`, `vanilla-ts`  
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
