---
persona: reviewer
tier: 3
---

# reviewer — task-local overrides

## Harness Audit (SKILL-SCAN + Event-SLL)
- **Check 0**: Did the agent declare `"Active Skills: [...]"` on action turns? (Read-only turns are exempt.)
- **Check 1**: Does `memory/notepad.md` Thinking Log contain entries for major Write/Edit/Bash decisions?
- **Check 2**: Was `[SLL-PROPOSE]` output when a New Wisdom or Error Recovery event occurred?
- If Check 0 or Check 1 is NO, **REJECT** immediately.

## Read order
1. `AGENTS.md` §7 + §7.1 (Level-Based Enforcement table).
2. Every `skills/<cat>/<id>/SKILL.md` whose `triggers` intersect the diff.
3. Parse each matched skill's `level` field (YAML FM).

## Judgement by level

- **L3 (Hard-Rule)** → **REJECT** on first violation. Output:
  `[L3 REJECT] <skill-id>: <anti-pattern cited> @ <file:line>`.
  No override, no justification accepted. Example L3 skills: `api-error-handling`.
- **L2 (Pattern)** → **REJECT unless** the PR description or diff comment carries a written justification. Cite which `## Anti-Patterns` bullet was hit.
- **L1 (Guidance)** → Comment only (`[L1 HINT]`). Never blocks.

## Mandatory checks
- `yarn lint` clean.
- `yarn build` clean.
- No raw `axios` / `fetch` / direct `localStorage` on token keys (L3 via `api-error-handling`).
- No inline `z.object` in component files (L2 via `rhf-zod`).
- No inline `useQuery({queryKey,queryFn})` (L2 via `tanstack-query`).

## Never
- Self-approve in the same active context.
- Downgrade a skill's `level` during review (that's `critic`'s job).
- Accept an "I'll fix it later" comment on an L3 violation.
