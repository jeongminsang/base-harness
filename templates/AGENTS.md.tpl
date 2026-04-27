# AGENTS.md — Claude Code Harness

> `VER: 1.0` · `PRESET: {{PRESET}}` · `STYLE: Lean/Condensed` · `OS: OMC-Native`

## 0. Glossary

- **SLL**: Self-Learning Loop (auto-extraction of skills)
- **CP / DP**: Control Plane (harness) / Data Plane (`{{SRC_DIR}}`)
- **QG**: Quality Gate (validation before skill promotion)
- **L/M/H**: Model Tiering (Haiku / Sonnet / Opus)
- **SR**: System-Reminder (context injection pattern)
- **V-Ev**: Verification Evidence (fresh logs required)

## 1. System Architecture

- **CTRL (CP)**: `skills/`, `hooks/`, `memory/`, `agents/`, `AGENTS.md`. Owner: Harness.
- **DATA (DP)**: `{{SRC_DIR}}`. Owner: App Logic. Harness MUST NOT edit without `executor` persona.
- **H1 (Harness-First)**: Every task starts with Harness Sync. Update/Create `SKILL.md` *BEFORE* touching `{{SRC_DIR}}`.
- **SEP**: Harness logic is root-level. App logic is `{{SRC_DIR}}`-scoped. No cross-pollution.
- **STACK**: {{PRESET}} — edit this line with your actual stack (e.g. React19+Vite7+TS5.8+...)

## 2. RULES — ENFORCEMENT

- **SKILL-SCAN**: At the start of any action turn, scan SKILL.md files whose `triggers` overlap the task. Declare `"Active Skills: [ids]"`. Read-only turns are exempt.
- **LOG-BEFORE-ACT**: Before any Write/Edit/Bash call, append one line to `memory/notepad.md` — `- [TOOL] why: <reason> / rule-check: <skill-id or none>`.
- **EVENT-SLL**: Propose knowledge capture when either event fires:
  - **New Wisdom**: New pattern established (diff ≥ 10 LOC + logic change + not duplicate)
  - **Structural Pattern**: New directory/module boundary created
  - **Error Recovery**: Root cause identified and fix confirmed
  - Format: `[SLL-PROPOSE] <id> / level=(1|2|3) / reason`
- **SR-LAST**: Pre-task hook system-reminders carry absolute authority.
- **REVIEWER-GATE**: L3 violation = automatic FAILURE. Task not done until compliant.
- **LEVEL-BLOCK**:
  - **L3**: Blocked. No override.
  - **L2**: Requires `// HARNESS-BYPASS: <reason>` comment to proceed.
- **EVIDENCE-MANDATORY**: Any "Fix" or "Refactor" claim without fresh `{{BUILD_CMD}}` or `{{LINT_CMD}}` output is invalid.

## 3. Directory & Asset Protocol

- **Atomic Skills**: `skills/<category>/<skill-id>/SKILL.md`
  - Mandatory YAML FM: `{name, description, id, level, triggers: [], source, version}`
  - `level`: `1` Guidance · `2` Pattern · `3` Hard-Rule
  - Structure: **Triggers → Context → Best Practices → Anti-Patterns**
- **Action Hooks**: `hooks/` (zero-dep Node `.cjs` scripts)
- **Persistence**: `memory/`
  - `notepad.md`: Short-term (STM). Survives compaction.
  - `project-memory.json`: Long-term (LTM) facts & metadata.

## 4. Model Tiering & Agent Lanes

| Tier | Model  | Agents                                    | Use Case                    |
| ---- | ------ | ----------------------------------------- | --------------------------- |
| LOW  | Haiku  | `explore`, `writer`, `learner`            | Lookup, Docs, SLL Mining    |
| MED  | Sonnet | `executor`, `debugger`, `test-engineer`   | Implementation, Fixes, V-Ev |
| HIGH | Opus   | `architect`, `planner`, `critic`, `reviewer` | Design, Strategy, QG Audit |

**Execution Lanes:**
1. **Analysis**: `explore` → `analyst` → `planner`
2. **Review**: `critic` → `reviewer`
3. **Action**: `executor` → `test-engineer` → `verifier`

## 5. Verification Protocol

- **NO-EVIDENCE = NO-SUCCESS**: `verifier` MUST reject claims without command output.
- **FRESHNESS**: Evidence must be < 5 mins old.
- **SCOPE**: Build pass + Test pass + Visual/Logic consistency check.

## 6. Governance (The 5 Laws)

1. **ATOMIC**: One skill = one atomic concept. No God-skills.
2. **LEAN**: K:V + bullets. No prose.
3. **NO-SRC-LEAK**: Harness files never imported by `{{SRC_DIR}}`.
4. **DRAFT-FIRST**: `post-task` writes `*.draft.md`. Human promotes to `SKILL.md`.
5. **QG**: Reject if diff < 10 LOC, no logic change, or duplicate.

### 6.1 Level-Based Enforcement

| Level | Label     | `reviewer`                           | `verifier`             | `executor`    |
| ----- | --------- | ------------------------------------ | ---------------------- | ------------- |
| **3** | Hard-Rule | REJECT immediately. No override.     | Treat as build FAIL.   | MUST comply.  |
| **2** | Pattern   | REJECT unless justification in diff. | Pass-through, log dev. | Follow default.|
| **1** | Guidance  | Suggest only; never blocks.          | No effect.             | Use as hint.  |

## 7. Self-Learning Loop (SLL)

```
Event → [SLL-PROPOSE] → User Approve → skills/<cat>/<id>/SKILL.md → verifier V-Ev
Post-task: git diff → QG → skills/*.draft.md → human promote → SKILL.md
```

## 8. Deliberation Protocol

### State Machine
```
PROPOSED → CHALLENGED → (REVISED) → CONSENSUS → executor implements
```

### Trigger Conditions
- **ARCH-TRIGGER**: New file in `archTriggerPaths` (see `hooks/config.json`)
- **QA-TRIGGER**: Bug fix or refactoring ≥ 30 LOC change

### Debate Rules
- `architect`: PROPOSED record mandatory — BEFORE executor starts
- `critic`: Min 3 challenge points, each with alternative code
- `analyst`: Quote evidence from both sides before CONSENSUS
- **Executor cannot start without CONSENSUS under ARCH-TRIGGER**

### Ledger
- All rounds: `memory/debate/rounds.json`
- Schema: `{ id, task, state, proposal, challenges[], consensus }`
- Completed rounds must never be deleted (audit trail)

### Agent Personas
| Persona   | Model  | File                   | Role                           |
|-----------|--------|------------------------|--------------------------------|
| architect | Opus   | `agents/architect.md`  | Propose design → PROPOSED      |
| critic    | Opus   | `agents/critic.md`     | Attack design → CHALLENGED     |
| analyst   | Sonnet | `agents/analyst.md`    | Finalize → CONSENSUS           |
| executor  | Sonnet | `agents/executor.md`   | Implement under CONSENSUS      |
| reviewer  | Opus   | `agents/reviewer.md`   | Final skill compliance audit   |

## 9. Delegation Enforcement (Anti-Self-Consistency)

**Rule**: If `memory/debate/rounds.json` has `state: "PROPOSED"`:

1. **PROHIBITED**: inline critic analysis in current context
2. **REQUIRED**:
   ```
   Agent(
     subagent_type="oh-my-claudecode:critic",
     prompt="[proposal content + relevant skills only, no full conversation history]"
   )
   ```
3. Critic updates round to `state: "CHALLENGED"` with ≥3 challenges
4. Analyst may only finalize CONSENSUS after CHALLENGED is confirmed

**Reason**: Proposer performing critic role in same context → self-consistency bias.

## 10. Persistent Memory Tags

- `<remember>`: Temp (7 days). Store in `notepad.md`.
- `<remember priority>`: Permanent. Store in `project-memory.json`.
