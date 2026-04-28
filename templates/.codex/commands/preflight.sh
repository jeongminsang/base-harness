#!/usr/bin/env bash
set -euo pipefail

node hooks/pre-task.cjs "$@"
