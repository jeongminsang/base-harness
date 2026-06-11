# Harness Architecture

## 1. Core vs Adapter

```text
COMMON CORE                   ADAPTERS
───────────────               ────────────────
hooks/                        .claude/
agents/                       .opencode/
skills/                       .omx/
memory/                       .codex/
AGENTS.md
```

- The core is tool-agnostic and repo-owned.
- `.claude/settings.json` is the Claude adapter only.
- `.opencode/settings.json` is the OpenCode (OMO) adapter only.
- `.omx/settings.json` is the OMX adapter only.
- `.codex/` is the Codex adapter only.
- App code stays in your project source tree and must not import harness files.

## 2. Shared Enforcement Semantics

The shared core defines:

- L3/L2 rule checks.
- Skill mining and draft generation.
- Build/lint gates.

Deterministic checks are run automatically under the pre-commit hook and stop hook, preventing incorrect/unverified code from being integrated.

## 3. OpenCode-based Adapters (Claude / OMO / OMX)

Claude, OpenCode (OMO), and OMX share the same hook event API. Each uses automatic hook events from its respective settings file:

- Claude: `.claude/settings.json`
- OpenCode (OMO): `.opencode/settings.json`
- OMX: `.omx/settings.json`

- `PreToolUse` → `hooks/pre-tool-enforcer.cjs`, `hooks/pre-task.cjs`
- `PostToolUse` for bash → `hooks/post-bash-verifier.cjs`
- `Stop` → `hooks/stop-enforcer.cjs`
- Git Hook: `hooks/git/pre-commit` triggers the final gate checks and skill mining.

## 4. Codex Adapter

Unlike the OpenCode-based platforms, Codex uses explicit commands instead of automatic hooks:

- `preflight.sh` loads matching skills.
- `final-check.sh` runs the final gate.
- Note: Post-task mining is automatically triggered during git pre-commit, making manual post-task execution optional.

## 5. Final Gate

The final gate runs the same deterministic validation.

Gate order:

1. No L3 violations in changed source files.
2. `buildCheckCmd` passes.
3. `lintCmd` passes on changed files.

Stop hook and pre-commit hook run the exact same gate pipeline.

## 6. Review (fresh-context)

- The debate ledger (rounds.json) has been completely removed to prevent self-signed approval loops.
- Large changes or structural proposals should be reviewed in a fresh context (no conversation history) using `/code-review` or a standalone code reviewer agent.
- A soft reminder is shown during the stop hook if uncommitted changes to guarded paths exceed the line limit.

## 7. Skill System

```text
skills/
└── <category>/
    └── <skill-id>/
        └── SKILL.md
```

- L3: hard block.
- L2: pattern block unless justified.
- L1: guidance only.

### SLL Promotion Ladder
```text
commit → pre-commit mining (.draft.md)        [자동, 커밋당 1회]
       → 사람 승격: .draft.md → SKILL.md       [수동 게이트]
       → L1/L2: pre-task 컨텍스트 주입
       → L3 승격 기준: ① 위반 반복 관찰 + ② 정규식 검출 가능 → preset l3-rules에 추가
       → 정규식 불가 패턴: SKILL.md + /code-review 담당
```

## 8. Config

`hooks/config.json` remains the shared runtime contract:

```json
{
  "version": "0.1",
  "preset": "vite",
  "adapters": "all",
  "buildCheckCmd": "./node_modules/.bin/tsc -b --noEmit",
  "lintCmd": "npx eslint",
  "srcDir": "src/",
  "archTriggerPaths": [
    "src/pages/",
    "src/components/"
  ],
  "qaTriggerMinLines": 30,
  "qualityGate": {
    "minDiffLines": 10,
    "rejectWhitespaceOnly": true,
    "rejectIfDuplicateSkill": true
  }
}
```
