<!-- HARNESS:MANAGED:START -->
# AGENTS.md — Base Harness

> `VER: 2.0.0` · `PRESET: {{PRESET}}` · `STYLE: Lean/Condensed` · `MODE: Tool-Neutral`

## 0. Glossary

- **SLL**: Self-Learning Loop (auto-extraction of skills)
- **CP / DP**: Control Plane (harness) / Data Plane (`{{SRC_DIR}}`)
- **QG**: Quality Gate (validation before skill promotion)
- **L/M/H**: Model Tiering (T1=Light / T2=Balanced / T3=Max, see §4)
- **SR**: System-Reminder (context injection pattern)
- **V-Ev**: Verification Evidence (fresh logs required)

## 1. System Architecture

- **CTRL (CP)**: `skills/`, `hooks/`, `agents/`, `AGENTS.md`, `memory/project-memory.json`. Owner: Harness.
- **DATA (DP)**: `{{SRC_DIR}}`. Owner: App Logic. Harness MUST NOT edit without `executor` persona.
- **H1 (Harness-First)**: Every task starts with Harness Sync. Update/Create `SKILL.md` *BEFORE* touching `{{SRC_DIR}}`.
- **SEP**: Harness logic is root-level. App logic is `{{SRC_DIR}}`-scoped. No cross-pollution.
- **STACK**: {{PRESET}} — edit this line with your actual stack (e.g. React19+Vite7+TS5.8+...)

## 2. RULES — ENFORCEMENT

- **SKILL-SCAN**: At the start of any action turn, scan SKILL.md files whose `triggers` overlap the task. Declare `"Active Skills: [ids]"`. Read-only turns are exempt.
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
- **POST-CHECK** *(hard gate — applies to every task without exception)*:
  Before reporting completion, run ALL of the following that apply to this codebase:
  1. **Build**: `{{BUILD_CMD}}` → must exit 0, zero errors.
  2. **Lint**: `{{LINT_CMD}}` on changed files → zero errors.
  3. **Type-check**: if the project has a type checker (e.g. `tsc --noEmit`, `pyright`) → zero type errors.
  Paste the actual command output inline. "It should work" without output = task NOT done.

## 3. Directory & Asset Protocol

- **Atomic Skills**: `skills/<category>/<skill-id>/SKILL.md`
  - Mandatory YAML FM: `{name, description, id, level, triggers: [], source, version}`
  - `level`: `1` Guidance · `2` Pattern · `3` Hard-Rule
  - Structure: **Triggers → Context → Best Practices → Anti-Patterns**
- **Action Hooks**: `hooks/` (zero-dep Node `.cjs` scripts)
- **Persistence**:
  - `skills/` (pre-task 컨텍스트 주입)
  - `memory/project-memory.json` (채굴 메타)
  - 플랫폼 자동 메모리 (장기 사실)

## 4. Model Tiering & Platform Mapping

### Tier Definitions

Each harness persona declares its required capability tier in `agents/<persona>.md`:

| Tier | Capability  | Harness Personas                        |
|------|-------------|----------------------------------------|
| 3    | Maximum     | architect, critic, reviewer            |
| 2    | Balanced    | analyst, executor                      |
| 1    | Lightweight | learner                                |

### Platform Model Mapping

Map each tier to your platform's available models:

| Platform | Tier 3 (Max)         | Tier 2 (Balanced)    | Tier 1 (Light)       |
|----------|----------------------|----------------------|----------------------|
| OMC      | claude-opus-4-6      | claude-sonnet-4-6    | claude-haiku-4-5     |
| OMO      | deepseek-v4-pro      | deepseek-v4          | deepseek-v4-mini     |
| OMX      | (platform default)   | (platform default)   | (platform default)   |

### Platform Agent Mapping

When invoking a harness persona as a sub-agent, use the corresponding platform agent:

| Persona   | Tier | OMO Agent   | OMC Agent        | Role |
|-----------|------|-------------|------------------|------|
| architect | 3    | prometheus  | architect        | 설계안 직접 반환, 대규모 설계는 fresh-context 리뷰 권고 |
| critic    | 3    | oracle      | critic           | 명시적 리뷰 요청 시 fresh-context로 리뷰 보고 직접 반환 |
| analyst   | 2    | prometheus  | analyst          | 제안과 리뷰가 충돌할 때 명시적 호출, 보고 반환 |
| executor  | 2    | hephaestus  | executor         | 구현 담당. 채굴은 git pre-commit이 자동 실행 |
| reviewer  | 3    | momus       | code-reviewer    | 코드 검증 및 최종 스킬 준수 여부 감사 |
| learner   | 1    | explore     | learner          | 히스토리 피드백 및 학습 담당 |

### Execution Lanes
1. **Analysis**: `explore` → `analyst` → `planner`
2. **Review**: `critic` → `reviewer`
3. **Action**: `executor` → `test-engineer` → `verifier`

## 5. Verification Protocol

- **NO-EVIDENCE = NO-SUCCESS**: `verifier` MUST reject claims without command output.
- **FRESHNESS**: Evidence must be < 5 mins old.
- **SCOPE**: POST-CHECK (§2) pass + Test pass + Visual/Logic consistency check.
- **AUTO-GATES**: Stop 훅 + git pre-commit이 L3→tsc→eslint를 자동 강제한다. 모델이 쓸 수 있는 검증 아티팩트는 존재하지 않는다.

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

Event → [SLL-PROPOSE] → User Approve → skills/<cat>/<id>/SKILL.md

### 승격 사다리
```text
commit → pre-commit mining (.draft.md)        [자동, 커밋당 1회]
       → 사람 승격: .draft.md → SKILL.md       [수동 게이트]
       → L1/L2: pre-task 컨텍스트 주입
       → L3 승격 기준: ① 위반 반복 관찰 + ② 정규식 검출 가능 → preset l3-rules에 추가
       → 정규식 불가 패턴: SKILL.md + /code-review 담당
```

## 8. Review (Anti-Self-Consistency)

- **디베이트 레저 제거**: 셀프 도장 실증으로 구조적 무력화가 확인되어 기존의 디베이트 상태 파일(rounds.json 등)은 완전히 삭제됨.
- **fresh-context 리뷰**: 설계안이나 대규모 변경은 대화 히스토리 없이 변경 코드(diff)와 스킬 파일만 전달하여 `/code-review` 또는 별도 reviewer 에이전트로 수행해야 함.
- **Stop 리마인더**: Stop 훅 게이트 통과 시 주요 경로에 미커밋 변경이 `qaTriggerMinLines`(기본 30)줄 이상 있을 경우 차단 없이 `/code-review`를 권고하는 메시지를 띄움.

## 9. Codex Workflow

Codex does not receive automatic hook events. Run these commands manually at the indicated points:

| When | Command | What it does |
|------|---------|--------------|
| Before major work | `./.codex/commands/preflight.sh "<task summary>"` | Loads matching skills |
| Before finishing | `./.codex/commands/final-check.sh` | Runs full gate: L3 → tsc → eslint (must exit 0) |

**Rules:**
- `final-check.sh` **must pass** before a task is considered done. A non-zero exit is a hard block.
<!-- HARNESS:MANAGED:END -->
