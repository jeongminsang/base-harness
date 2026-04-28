# Codex Adapter

Codex does not use Claude's automatic hook API, so this adapter provides explicit commands that run the same shared harness checks.

## Commands

```bash
./.codex/commands/preflight.sh "task summary"
./.codex/commands/post-task.sh
./.codex/commands/final-check.sh
./.codex/commands/mark-verified.sh src/file-a.ts src/file-b.tsx
```

## Workflow

1. Run `preflight.sh` before major implementation work to load matching skills and open debate rounds.
2. Run `post-task.sh` after substantial edits to draft skills and create debate rounds for `ARCH-TRIGGER` paths.
3. Run your build, lint, and task-specific verification.
4. Record the verified files with `mark-verified.sh`.
5. Run `final-check.sh` before finishing.

The canonical verification artifact is `state/verified-complete.json`. During migration, the harness still accepts the legacy `.omc/state/verified_complete.json` file if it already exists.
