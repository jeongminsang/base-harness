# Codex Adapter

Codex does not use Claude's automatic hook API, so this adapter provides explicit commands that run the same shared harness checks.

## Commands

```bash
./.codex/commands/preflight.sh "task summary"
./.codex/commands/post-task.sh
./.codex/commands/final-check.sh
```

## Workflow

1. Run `preflight.sh` before major implementation work to load matching skills.
2. Run your build, lint, and task-specific verification. (Note: `post-task.sh` is automatically run during git pre-commit, so manual invocation is optional).
3. Run `final-check.sh` before finishing.
