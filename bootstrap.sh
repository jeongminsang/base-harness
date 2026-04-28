#!/usr/bin/env bash
# Claude Code Harness — Bootstrap Installer
#
# Remote:  curl -sSL https://raw.githubusercontent.com/jeongminsang/harness/main/bootstrap.sh | bash
# Local:   bash bootstrap.sh

set -euo pipefail

HARNESS_VERSION="1.0.0"
HARNESS_BRANCH="main"
HARNESS_REPO_RAW="https://raw.githubusercontent.com/jeongminsang/harness/${HARNESS_BRANCH}"

# ─── TTY detection: curl | bash steals stdin; reads need /dev/tty ─────────────
_HAS_TTY=false
{ true < /dev/tty; } 2>/dev/null && _HAS_TTY=true || true

# ─── Detect local mode (running from inside the harness source repo) ──────────
SCRIPT_DIR=""
if [[ -n "${BASH_SOURCE[0]:-}" && "${BASH_SOURCE[0]}" != "bash" ]]; then
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd || true)"
fi

LOCAL_MODE=false
TEMPLATES_DIR=""
PRESETS_DIR=""
if [[ -n "$SCRIPT_DIR" && -f "$SCRIPT_DIR/templates/hooks/config.json" ]]; then
  LOCAL_MODE=true
  TEMPLATES_DIR="$SCRIPT_DIR/templates"
  PRESETS_DIR="$SCRIPT_DIR/presets"
fi

# ─── Helpers ──────────────────────────────────────────────────────────────────

bold()   { printf '\033[1m%s\033[0m' "$*"; }
green()  { printf '\033[32m%s\033[0m' "$*"; }
yellow() { printf '\033[33m%s\033[0m' "$*"; }
red()    { printf '\033[31m%s\033[0m' "$*"; }
info()   { echo "  $(bold '→') $*"; }
ok()     { echo "  $(green '✔') $*"; }
warn()   { echo "  $(yellow '⚠') $*"; }
die()    { echo "  $(red '✖') $*"; exit 1; }

_read_answer() {
  local answer=""
  if [[ "$_HAS_TTY" == true ]]; then
    read -r answer < /dev/tty || true
  else
    read -r answer || true
  fi
  echo "$answer"
}

prompt() {
  local question="$1" default="$2" answer
  printf "  %s [%s]: " "$(bold "$question")" "$default" >&2
  answer="$(_read_answer)"
  echo "${answer:-$default}"
}

prompt_choice() {
  local question="$1" options="$2" default="$3" answer
  printf "  %s (%s) [%s]: " "$(bold "$question")" "$options" "$default" >&2
  answer="$(_read_answer)"
  echo "${answer:-$default}"
}

fetch_file() {
  local rel_path="$1" dest="$2"
  mkdir -p "$(dirname "$dest")"
  if [[ "$LOCAL_MODE" == true ]]; then
    cp "$TEMPLATES_DIR/$rel_path" "$dest"
  else
    curl -fsSL "$HARNESS_REPO_RAW/templates/$rel_path" -o "$dest"
  fi
}

fetch_preset_file() {
  local preset="$1" dest="$2"
  mkdir -p "$(dirname "$dest")"
  if [[ "$LOCAL_MODE" == true ]]; then
    cp "$PRESETS_DIR/$preset/l3-rules.cjs" "$dest"
  else
    curl -fsSL "$HARNESS_REPO_RAW/presets/$preset/l3-rules.cjs" -o "$dest"
  fi
}

# ─── Banner ───────────────────────────────────────────────────────────────────

echo ""
echo "  $(bold 'Claude Code Harness') v${HARNESS_VERSION}"
echo "  Self-enforcing AI harness for Claude Code projects"
echo ""

# ─── Step 1: Prerequisites ────────────────────────────────────────────────────

info "Checking prerequisites..."

if ! git rev-parse --git-dir > /dev/null 2>&1; then
  die "Not a git repository. Run from your project root."
fi

NODE_VER=$(node --version 2>/dev/null | sed 's/v//' | cut -d. -f1 || echo "0")
if [[ "$NODE_VER" -lt 18 ]]; then
  die "Node.js >= 18 required (found: $(node --version 2>/dev/null || echo 'none'))"
fi

ok "git repo: $(git rev-parse --show-toplevel)"
ok "Node.js $(node --version)"

# Detect update mode
UPDATE_MODE=false
if [[ -d "hooks" && -f "hooks/config.json" ]]; then
  UPDATE_MODE=true
  warn "Existing harness detected — running in update mode"
  echo ""
  printf "  $(bold 'Update hooks and agents?') (y/n) [y]: "
  read -r update_confirm
  if [[ "${update_confirm:-y}" != "y" ]]; then
    echo ""
    echo "  Cancelled. No changes made."
    exit 0
  fi
fi

echo ""

# ─── Step 2: Interactive configuration ───────────────────────────────────────

info "Project configuration"
echo ""

PRESET=$(prompt_choice "Stack preset" "react-ts | next-ts | vanilla-ts" "react-ts")
BUILD_CMD=$(prompt "Build check command" "yarn tsc --noEmit")
LINT_CMD=$(prompt "Lint command" "npx eslint")
SRC_DIR=$(prompt "Source directory" "src/")
ARCH_PATHS_RAW=$(prompt "ARCH-TRIGGER paths (comma-separated)" "src/pages/,src/components/")
MIN_DIFF=$(prompt "Min diff lines for skill mining" "10")

echo ""

# Build JSON array from comma-separated paths
IFS=',' read -ra _ARCH_ARRAY <<< "$ARCH_PATHS_RAW"
ARCH_JSON="["
for i in "${!_ARCH_ARRAY[@]}"; do
  _p="${_ARCH_ARRAY[$i]#"${_ARCH_ARRAY[$i]%%[![:space:]]*}"}"  # ltrim
  _p="${_p%"${_p##*[![:space:]]}"}"                             # rtrim
  [[ $i -gt 0 ]] && ARCH_JSON="${ARCH_JSON}, "
  ARCH_JSON="${ARCH_JSON}\"${_p}\""
done
ARCH_JSON="${ARCH_JSON}]"

# ─── Step 3: Install core hook files ─────────────────────────────────────────

info "Installing hook scripts..."
mkdir -p hooks/lib
fetch_file "hooks/pre-task.cjs"             "hooks/pre-task.cjs"
fetch_file "hooks/pre-tool-enforcer.cjs"    "hooks/pre-tool-enforcer.cjs"
fetch_file "hooks/post-task.cjs"            "hooks/post-task.cjs"
fetch_file "hooks/post-bash-verifier.cjs"   "hooks/post-bash-verifier.cjs"
fetch_file "hooks/stop-enforcer.cjs"        "hooks/stop-enforcer.cjs"
fetch_file "hooks/on-failure.cjs"           "hooks/on-failure.cjs"
fetch_file "hooks/lib/l3-rules.cjs"         "hooks/lib/l3-rules.cjs"
ok "Hooks installed"

info "Installing agent personas..."
mkdir -p agents
for agent in architect critic analyst executor reviewer learner; do
  fetch_file "agents/${agent}.md" "agents/${agent}.md"
done
ok "Agents installed"

# ─── Step 4: Apply preset ─────────────────────────────────────────────────────

info "Applying preset: ${PRESET}..."
fetch_preset_file "$PRESET" "hooks/lib/l3-preset.cjs"
ok "Preset ${PRESET} → hooks/lib/l3-preset.cjs"

# ─── Step 5: Write config.json ────────────────────────────────────────────────

info "Writing hooks/config.json..."
cat > hooks/config.json << CONFIGEOF
{
  "version": "0.1",
  "preset": "${PRESET}",
  "buildCheckCmd": "${BUILD_CMD}",
  "lintCmd": "${LINT_CMD}",
  "srcDir": "${SRC_DIR}",
  "archTriggerPaths": ${ARCH_JSON},
  "qaTriggerMinLines": 30,
  "debateLedger": "../memory/debate/rounds.json",
  "qualityGate": {
    "minDiffLines": ${MIN_DIFF},
    "rejectWhitespaceOnly": true,
    "rejectIfDuplicateSkill": true
  }
}
CONFIGEOF
ok "hooks/config.json written"

# ─── Step 6: Wire .claude/settings.json ──────────────────────────────────────

mkdir -p .claude
if [[ -f ".claude/settings.json" && "$UPDATE_MODE" == true ]]; then
  warn ".claude/settings.json exists — merging hooks section only"
  HOOKS_JSON=$(
    if [[ "$LOCAL_MODE" == true ]]; then
      cat "$TEMPLATES_DIR/.claude/settings.json"
    else
      curl -fsSL "$HARNESS_REPO_RAW/templates/.claude/settings.json"
    fi
  )
  node -e "
    const fs = require('fs');
    const existing = JSON.parse(fs.readFileSync('.claude/settings.json','utf8'));
    const tpl = JSON.parse(process.env.HOOKS_JSON);
    fs.writeFileSync('.claude/settings.json', JSON.stringify({...existing, hooks: tpl.hooks}, null, 2));
  " HOOKS_JSON="$HOOKS_JSON"
else
  fetch_file ".claude/settings.json" ".claude/settings.json"
fi
ok ".claude/settings.json ready"

# ─── Step 7: Generate AGENTS.md ───────────────────────────────────────────────

if [[ ! -f "AGENTS.md" ]]; then
  info "Generating AGENTS.md..."
  if [[ "$LOCAL_MODE" == true ]]; then
    TPL=$(cat "$TEMPLATES_DIR/AGENTS.md.tpl")
  else
    TPL=$(curl -fsSL "$HARNESS_REPO_RAW/templates/AGENTS.md.tpl")
  fi
  printf '%s' "$TPL" \
    | sed "s|{{PRESET}}|${PRESET}|g" \
    | sed "s|{{BUILD_CMD}}|${BUILD_CMD}|g" \
    | sed "s|{{LINT_CMD}}|${LINT_CMD}|g" \
    | sed "s|{{SRC_DIR}}|${SRC_DIR}|g" \
    > AGENTS.md
  ok "AGENTS.md generated"
else
  warn "AGENTS.md exists — skipping (update manually to reflect new stack info)"
fi

# ─── Step 8: Initialize memory/ ───────────────────────────────────────────────

if [[ ! -d "memory" ]]; then
  info "Initializing memory/..."
  mkdir -p memory/debate

  cat > memory/project-memory.json << MEMEOF
{
  "version": "0.1",
  "facts": [
    { "k": "preset",  "v": "${PRESET}" },
    { "k": "build",   "v": "${BUILD_CMD}" },
    { "k": "lint",    "v": "${LINT_CMD}" },
    { "k": "srcDir",  "v": "${SRC_DIR}" }
  ],
  "skills": []
}
MEMEOF

  printf '# Harness Notepad\n\n## Thinking Log\n' > memory/notepad.md

  printf '{\n  "schema": "1.0",\n  "rounds": []\n}\n' > memory/debate/rounds.json
  ok "memory/ initialized"
fi

# ─── Step 9: Initialize skills/ ───────────────────────────────────────────────

if [[ ! -d "skills" ]]; then
  info "Initializing skills/..."
  mkdir -p skills/conventions/no-any-type skills/fixes
  fetch_file "skills/conventions/no-any-type/SKILL.md" "skills/conventions/no-any-type/SKILL.md"
  touch skills/fixes/.gitkeep
  ok "skills/ initialized"
fi

# ─── Done ─────────────────────────────────────────────────────────────────────

echo ""
echo "  $(green "$(bold '✅ Harness installed successfully!')")"
echo ""
echo "  Configuration:"
printf "    %-14s %s\n" "Preset:"    "${PRESET}"
printf "    %-14s %s\n" "Build:"     "${BUILD_CMD}"
printf "    %-14s %s\n" "Lint:"      "${LINT_CMD}"
printf "    %-14s %s\n" "Src dir:"   "${SRC_DIR}"
printf "    %-14s %s\n" "ARCH paths:" "${ARCH_PATHS_RAW}"
echo ""
echo "  Next steps:"
echo "    1. Review $(bold 'AGENTS.md') — add your stack-specific notes"
echo "    2. Stage:  $(bold "git add hooks/ agents/ memory/ skills/ .claude/ AGENTS.md")"
echo "    3. Open Claude Code — hooks are live"
echo ""
echo "  Docs: harness/ARCHITECTURE.md"
echo ""
