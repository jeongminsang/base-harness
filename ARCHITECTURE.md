# Harness Architecture

## 1. Core vs Adapter

```text
COMMON CORE                   ADAPTERS
───────────────               ────────────────
hooks/                        .claude/
agents/                       .opencode/
skills/                       .omx/
memory/                       .codex/
state/
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

- L3/L2 rule checks
- Debate ledger state in `memory/debate/rounds.json`
- Skill mining and draft generation
- Build/lint gates
- Final verification gate
- Canonical success artifact in `state/verified-complete.json`

The legacy `.omc/state/verified_complete.json` path is read only for backward compatibility during migration.

## 3. OpenCode-based Adapters (Claude / OMO / OMX)

Claude, OpenCode (OMO), and OMX share the same hook event API. Each uses automatic hook events from its respective settings file:

- Claude: `.claude/settings.json`
- OpenCode (OMO): `.opencode/settings.json`
- OMX: `.omx/settings.json`

- `PreToolUse` → `hooks/pre-tool-enforcer.cjs`, `hooks/pre-task.cjs`
- `PostToolUse` for writes/edits → `hooks/post-task.cjs`
- `PostToolUse` for bash → `hooks/post-bash-verifier.cjs`
- `Stop` → `hooks/stop-enforcer.cjs`

These adapters are the only place that depends on hook event names (shared across all OpenCode-based platforms).

## 4. Codex Adapter

Unlike the OpenCode-based platforms, Codex uses explicit commands instead of automatic hooks:

- `./.codex/commands/preflight.sh "task summary"`
- `./.codex/commands/post-task.sh`
- `./.codex/commands/mark-verified.sh <files...>`
- `./.codex/commands/final-check.sh`

These commands call the same shared Node entrypoints used by the Claude adapter where possible.

## 5. Final Gate

The final gate is shared by both tools.

Gate order:

1. No open `PROPOSED` debate rounds.
2. No L3 violations in changed source files.
3. `buildCheckCmd` passes.
4. `lintCmd` passes on changed files.
5. Verification artifact covers all changed files.

Claude / OMO / OMX reach this through `hooks/stop-enforcer.cjs`. Codex reaches it through `hooks/run-final-check.cjs`.

## 6. Deliberation Protocol

State machine:

```text
PROPOSED → CHALLENGED → (REVISED) → CONSENSUS → executor implements
```

Rules:

- `architect` writes `PROPOSED`
- `critic` must provide at least three challenge points
- `analyst` finalizes `CONSENSUS`
- `executor` does not implement guarded architecture work before `CONSENSUS`

The anti-self-consistency rule is shared: the critic must run in a fresh agent context rather than inline in the same reasoning thread.

## 7. Skill System

```text
skills/
└── <category>/
    └── <skill-id>/
        └── SKILL.md
```

- L3: hard block
- L2: pattern block unless justified
- L1: guidance only

`post-task.cjs` writes `*.draft.md` files only. Human promotion is still required to activate a skill.

## 8. Config

`hooks/config.json` remains the shared runtime contract. New keys:

```json
{
  "adapters": "both",
  "verifiedCompletePath": "../state/verified-complete.json"
}
```

Older installs can keep working because the verifier gate still reads the legacy `.omc` artifact path as a fallback.
