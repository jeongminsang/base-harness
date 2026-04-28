# Harness Architecture

## 1. Core Concept: Two Planes

```
CONTROL PLANE (CP)          DATA PLANE (DP)
────────────────────         ────────────────
hooks/                       src/
agents/                      (your app code)
skills/
memory/
AGENTS.md
```

- **CP** is owned by the harness. Claude reads it but never imports it into `src/`.
- **DP** is owned by your app. Harness rules govern how Claude writes to it.
- Cross-pollution is forbidden: no harness file is ever `import`ed by app code.

---

## 2. Hook Pipeline

Claude Code fires hooks at specific lifecycle events. All hooks are zero-dependency Node.js `.cjs` scripts.

```
Write/Edit attempt
  │
  ├─ [PreToolUse] pre-tool-enforcer.cjs  ← L3 deny gate
  ├─ [PreToolUse] pre-task.cjs           ← skill + debate context injection
  │
  ▼  (file written if no deny)
  │
  ├─ [PostToolUse] post-task.cjs         ← diff mining, ARCH-TRIGGER, draft skills
  │
Bash command
  ├─ [PostToolUse] post-bash-verifier.cjs ← warn on build/lint errors
  │
Session stop
  └─ [Stop] stop-enforcer.cjs            ← 4-gate exit barrier
```

### pre-tool-enforcer.cjs
- Runs on every `Write` / `Edit` targeting `src/`
- Calls `checkL3()` → `deny` if violations found
- Calls `checkL2()` → `allow` with warning context
- Returns `permissionDecision: "deny"` to block the write

### pre-task.cjs
- Scans `skills/` for SKILL.md files whose `triggers` match the current task text
- Injects top-3 matching skills as `<harness-ctx>` block
- Injects active debate rounds (`state != "CONSENSUS"`) into context

### post-task.cjs
- Runs after every `Write` / `Edit`
- Quality gates: diff >= 10 LOC, not whitespace-only, no duplicate slug
- ARCH-TRIGGER: if touched file is in `archTriggerPaths` → creates PROPOSED debate round
- Heuristic bucketing → writes `skills/<bucket>/<slug>.draft.md`
- Appends skill entry to `memory/project-memory.json`

### post-bash-verifier.cjs
- Runs after every `Bash` command
- Detects failure patterns (`error:`, `TS####`, `exit code: [1-9]`)
- Adds warning context so Claude doesn't assume success on failure

### stop-enforcer.cjs
Four sequential gates — all must pass before session can exit:

| Gate | Check | Block message |
|------|-------|---------------|
| 0 | No open PROPOSED debate rounds | "Spawn critic Agent first" |
| 1 | No L3 violations in changed `src/` files | Lists violations |
| 2 | `buildCheckCmd` passes (default: `tsc --noEmit`) | Type errors |
| 3 | `lintCmd` passes on changed files | Lint errors |
| 4 | `verified_complete.json` covers all changed files | "Run verifier Agent" |

---

## 3. Skill System

### Structure

```
skills/
└── <category>/
    └── <skill-id>/
        └── SKILL.md
```

### SKILL.md Format

```yaml
---
name: my-skill
description: one-line summary
id: my-skill
level: 2          # 1 | 2 | 3
triggers: ["keyword1", "keyword2"]
source: src/path/to/origin.ts
version: 1.0.0
---

# my-skill

## Triggers
## Context
## Best Practices
## Anti-Patterns
```

### Skill Levels

| Level | Label | Enforcement |
|-------|-------|-------------|
| **L3** | Hard-Rule | Write blocked on violation. Stop gate blocks session exit. |
| **L2** | Pattern | Write blocked unless `// HARNESS-BYPASS: <reason>` in diff. |
| **L1** | Guidance | Hint only — never blocks anything. |

L3 is reserved for security, data integrity, and user-safety rules.

### SLL Lifecycle (Self-Learning Loop)

```
Event trigger (New Wisdom / Error Recovery)
  │
  ▼
[SLL-PROPOSE] <id> / level=N / reason    ← Claude proposes
  │
  ├─ User approves → skills/<cat>/<id>/SKILL.md
  └─ User rejects  → Drop
  
Post-task path (automated):
git diff → quality gates → skills/<bucket>/<slug>.draft.md
                                   │
                            human renames to .md to activate
```

Draft files (`*.draft.md`) are inert — hooks ignore them. Human curation is required to activate.

---

## 4. Deliberation Protocol

New `src/pages/` or `src/components/` files trigger the debate state machine:

```
PROPOSED → CHALLENGED → (REVISED) → CONSENSUS → executor writes file
```

### Roles

| Agent | Model | Responsibility |
|-------|-------|----------------|
| `architect` | Opus | Writes PROPOSED design to `memory/debate/rounds.json` |
| `critic` | Opus | Challenges with ≥3 attack vectors + alternatives |
| `analyst` | Sonnet | Evaluates both sides, writes CONSENSUS |
| `executor` | Sonnet | Implements under CONSENSUS design |
| `reviewer` | Opus | Audits implementation against L3/L2/L1 rules |
| `learner` | Haiku | Mines completed diffs for draft skills |

### Debate Ledger (`memory/debate/rounds.json`)

```json
{
  "schema": "1.0",
  "rounds": [
    {
      "id": "001",
      "task": "Add UserProfile page",
      "state": "CONSENSUS",
      "proposal": { "agent": "architect", "content": "..." },
      "challenges": ["L3: ...", "L2: ...", "Perf: ..."],
      "consensus": "Agreed design summary"
    }
  ]
}
```

- Rounds are **never deleted** (immutable audit trail)
- `state: "CONSENSUS"` requires `challenges.length >= 3` (enforced by l3-rules)

---

## 5. Delegation Enforcement (Anti-Self-Consistency)

**Problem**: If the same Claude instance proposes AND critiques, it will be biased toward its own proposal.

**Solution** (AGENTS.md §11):

When `rounds.json` has `state: "PROPOSED"`:

1. **PROHIBITED**: inline critic analysis in current context
2. **REQUIRED**:
   ```
   Agent(
     subagent_type="oh-my-claudecode:critic",
     prompt="[proposal content + relevant skills only]"
   )
   ```
3. The sub-agent runs in a fresh context → no knowledge of proposer's reasoning
4. Only after `state: "CHALLENGED"` can analyst finalize CONSENSUS

**Mechanical enforcement**:
- `stop-enforcer.cjs` Gate 0: blocks session exit if any PROPOSED round is open
- `l3-rules.cjs` ARCH-TRIGGER: CONSENSUS with `challenges.length < 3` is invalid

---

## 6. Preset System

Stack-specific L3/L2 rules live in `harness/presets/<name>/l3-rules.cjs`.

### Interface

```javascript
// harness/presets/<name>/l3-rules.cjs
module.exports = {
  checkL3(filePath, content, opts) {
    // return array of { skill: string, detail: string }
    return [];
  },
  checkL2(filePath, content) {
    // return array of { skill: string, detail: string }
    return [];
  },
};
```

### Available Presets

| Preset | Rules included |
|--------|----------------|
| `vite` | `api-error-handling`, `rhf-zod`, `prohibited-utilities`, `custom-hook-extraction` |
| `vanilla-ts` | None (core rules only: `no-any-type`, `ARCH-TRIGGER`) |

### Custom Preset

1. Create `harness/presets/<name>/l3-rules.cjs`
2. Set `"preset": "<name>"` in `hooks/config.json`
3. Hooks pick it up automatically on next run

---

## 7. Memory Layout

| File | Type | Purpose |
|------|------|---------|
| `memory/notepad.md` | STM | Per-session thinking log (`LOG-BEFORE-ACT` entries). Survives context compaction. |
| `memory/project-memory.json` | LTM | Immutable project facts (stack, token keys) + skill audit trail. |
| `memory/debate/rounds.json` | Ledger | PROPOSED→CONSENSUS state machine. Never deleted. |

---

## 8. Config Reference (`hooks/config.json`)

```json
{
  "version": "0.1",
  "preset": "vite",
  "buildCheckCmd": "yarn tsc --noEmit",
  "lintCmd": "npx eslint",
  "srcDir": "src/",
  "archTriggerPaths": ["src/pages/", "src/components/"],
  "qaTriggerMinLines": 30,
  "debateLedger": "../memory/debate/rounds.json",
  "qualityGate": {
    "minDiffLines": 10,
    "rejectWhitespaceOnly": true,
    "rejectIfDuplicateSkill": true
  }
}
```
