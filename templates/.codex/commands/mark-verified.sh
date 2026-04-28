#!/usr/bin/env bash
set -euo pipefail

HARNESS_VERIFIER="codex" node hooks/write-verified-complete.cjs "$@"
