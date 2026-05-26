#!/usr/bin/env bash
# Base Harness — Bootstrap Installer
#
# Remote:  curl -sSL https://raw.githubusercontent.com/jeongminsang/base-harness/main/bootstrap.sh | bash
# Local:   bash bootstrap.sh

set -euo pipefail

HARNESS_VERSION="1.1.0"
HARNESS_BRANCH="main"
HARNESS_REPO_RAW="https://raw.githubusercontent.com/jeongminsang/base-harness/${HARNESS_BRANCH}"

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

prompt_yn() {
  local question="$1" default="${2:-y}" answer normalized
  printf "  %s (y/n) [%s]: " "$(bold "$question")" "$default" >&2
  answer="$(_read_answer)"
  normalized="$(printf '%s' "${answer:-$default}" | tr '[:upper:]' '[:lower:]')"
  [[ "$normalized" == "y" || "$normalized" == "yes" ]]
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
echo "  $(bold 'Base Harness') v${HARNESS_VERSION}"
echo "  Self-enforcing harness for AI coding assistants"
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
  update_confirm="$(_read_answer)"
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

PRESET=$(prompt_choice "Stack preset" "vite | next-ts | vanilla-ts" "vite")
ADAPTERS=$(prompt_choice "Adapter install" "omc | omo | omx | all" "all")
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

# ─── Step 3: Install common core ─────────────────────────────────────────────

info "Installing common harness files..."
mkdir -p hooks/lib
fetch_file "hooks/pre-task.cjs"             "hooks/pre-task.cjs"
fetch_file "hooks/pre-tool-enforcer.cjs"    "hooks/pre-tool-enforcer.cjs"
fetch_file "hooks/post-task.cjs"            "hooks/post-task.cjs"
fetch_file "hooks/post-bash-verifier.cjs"   "hooks/post-bash-verifier.cjs"
fetch_file "hooks/stop-enforcer.cjs"        "hooks/stop-enforcer.cjs"
fetch_file "hooks/run-final-check.cjs"      "hooks/run-final-check.cjs"
fetch_file "hooks/write-verified-complete.cjs" "hooks/write-verified-complete.cjs"
fetch_file "hooks/on-failure.cjs"           "hooks/on-failure.cjs"
fetch_file "hooks/lib/l3-rules.cjs"         "hooks/lib/l3-rules.cjs"
fetch_file "hooks/lib/final-gate.cjs"       "hooks/lib/final-gate.cjs"
ok "Common hook files installed"

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
  "adapters": "${ADAPTERS}",
  "buildCheckCmd": "${BUILD_CMD}",
  "lintCmd": "${LINT_CMD}",
  "srcDir": "${SRC_DIR}",
  "archTriggerPaths": ${ARCH_JSON},
  "qaTriggerMinLines": 30,
  "debateLedger": "memory/debate/rounds.json",
  "verifiedCompletePath": "state/verified-complete.json",
  "qualityGate": {
    "minDiffLines": ${MIN_DIFF},
    "rejectWhitespaceOnly": true,
    "rejectIfDuplicateSkill": true
  }
}
CONFIGEOF
ok "hooks/config.json written"

# ─── Step 6: Install adapters ────────────────────────────────────────────────

install_claude=false
install_opencode=false
install_omx=false
case "$ADAPTERS" in
  omc)      install_claude=true ;;
  omo)      install_opencode=true ;;
  omx)      install_omx=true ;;
  all)      install_claude=true; install_opencode=true; install_omx=true ;;
  *)
    warn "Unknown adapter choice '${ADAPTERS}' — defaulting to all"
    install_claude=true
    install_opencode=true
    install_omx=true
    ;;
esac

if [[ "$install_claude" == true ]]; then
  info "Installing Claude adapter..."
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
    HOOKS_JSON="$HOOKS_JSON" node -e "
      const fs = require('fs');
      const existing = JSON.parse(fs.readFileSync('.claude/settings.json','utf8'));
      const tpl = JSON.parse(process.env.HOOKS_JSON);
      fs.writeFileSync('.claude/settings.json', JSON.stringify({...existing, hooks: tpl.hooks}, null, 2));
    "
  else
    fetch_file ".claude/settings.json" ".claude/settings.json"
  fi
  ok "Claude adapter ready"
fi

if [[ "$install_opencode" == true ]]; then
  info "Installing OpenCode (OMO) adapter..."
  mkdir -p .opencode
  fetch_file ".opencode/settings.json" ".opencode/settings.json"
  ok "OpenCode adapter ready"
fi

if [[ "$install_omx" == true ]]; then
  info "Installing OMX adapter..."
  mkdir -p .omx
  fetch_file ".omx/settings.json" ".omx/settings.json"
  ok "OMX adapter ready"
fi

# ─── Step 7: Generate AGENTS.md ───────────────────────────────────────────────

_render_agents_tpl() {
  local tpl
  if [[ "$LOCAL_MODE" == true ]]; then
    tpl=$(cat "$TEMPLATES_DIR/AGENTS.md.tpl")
  else
    tpl=$(curl -fsSL "$HARNESS_REPO_RAW/templates/AGENTS.md.tpl")
  fi
  printf '%s' "$tpl" \
    | sed "s|{{PRESET}}|${PRESET}|g" \
    | sed "s|{{BUILD_CMD}}|${BUILD_CMD}|g" \
    | sed "s|{{LINT_CMD}}|${LINT_CMD}|g" \
    | sed "s|{{SRC_DIR}}|${SRC_DIR}|g"
}

if [[ ! -f "AGENTS.md" ]]; then
  info "Generating AGENTS.md..."
  _render_agents_tpl > AGENTS.md
  ok "AGENTS.md generated"
elif grep -q "<!-- HARNESS:MANAGED:START -->" AGENTS.md 2>/dev/null; then
  info "Updating AGENTS.md harness-managed sections..."
  _AGENTS_NEW=$(_render_agents_tpl)
  _AGENTS_BEFORE=$(awk '/<!-- HARNESS:MANAGED:START -->/{exit} {print}' AGENTS.md)
  _AGENTS_AFTER=$(awk '/<!-- HARNESS:MANAGED:END -->/{found=1; next} found{print}' AGENTS.md)
  {
    [[ -n "$_AGENTS_BEFORE" ]] && printf '%s\n' "$_AGENTS_BEFORE"
    printf '%s\n' "$_AGENTS_NEW"
    [[ -n "$_AGENTS_AFTER" ]] && printf '\n%s' "$_AGENTS_AFTER"
  } > AGENTS.md
  ok "AGENTS.md harness sections updated (user content preserved)"
else
  warn "AGENTS.md exists without sentinel markers"
  if prompt_yn "Regenerate fully? (user customizations will be lost)"; then
    info "Regenerating AGENTS.md..."
    _render_agents_tpl > AGENTS.md
    ok "AGENTS.md regenerated"
  else
    warn "AGENTS.md skipped — re-run bootstrap after adding sentinels to update"
  fi
fi

# ─── Step 8: Initialize skills/ ───────────────────────────────────────────────

if [[ ! -d "skills" ]]; then
  info "Initializing skills/..."
  mkdir -p skills/conventions/no-any-type skills/fixes
  fetch_file "skills/conventions/no-any-type/SKILL.md" "skills/conventions/no-any-type/SKILL.md"
  touch skills/fixes/.gitkeep
  ok "skills/ initialized"
fi

# ─── Step 9: Update .gitignore ────────────────────────────────────────────────

GITIGNORE_ENTRIES=(
  "# Harness runtime state (agent-generated, local only)"
  "memory/debate/"
  "memory/notepad.md"
  "memory/project-memory.json"
  "state/"
)

if [[ ! -f ".gitignore" ]]; then
  touch .gitignore
fi

needs_update=false
for entry in "${GITIGNORE_ENTRIES[@]}"; do
  if ! grep -qxF "$entry" .gitignore 2>/dev/null; then
    needs_update=true
    break
  fi
done

if [[ "$needs_update" == true ]]; then
  info "Updating .gitignore with harness runtime paths..."
  printf '\n' >> .gitignore
  for entry in "${GITIGNORE_ENTRIES[@]}"; do
    if ! grep -qxF "$entry" .gitignore 2>/dev/null; then
      printf '%s\n' "$entry" >> .gitignore
    fi
  done
  ok ".gitignore updated"
fi

# ─── Done ─────────────────────────────────────────────────────────────────────

echo ""
echo "  $(green "$(bold '✅ Harness installed successfully!')")"
echo ""
echo "  Configuration:"
printf "    %-14s %s\n" "Preset:"    "${PRESET}"
printf "    %-14s %s\n" "Adapters:"  "${ADAPTERS}"
printf "    %-14s %s\n" "Build:"     "${BUILD_CMD}"
printf "    %-14s %s\n" "Lint:"      "${LINT_CMD}"
printf "    %-14s %s\n" "Src dir:"   "${SRC_DIR}"
printf "    %-14s %s\n" "ARCH paths:" "${ARCH_PATHS_RAW}"
echo ""
STAGE_TARGETS="hooks/ agents/ skills/ AGENTS.md"
if [[ "$install_claude" == true ]]; then
  STAGE_TARGETS="${STAGE_TARGETS} .claude/"
fi
if [[ "$install_opencode" == true ]]; then
  STAGE_TARGETS="${STAGE_TARGETS} .opencode/"
fi
if [[ "$install_omx" == true ]]; then
  STAGE_TARGETS="${STAGE_TARGETS} .omx/"
fi
echo "  Next steps:"
echo "    1. Review $(bold 'AGENTS.md') — add your stack-specific notes"
echo "    2. Stage:  $(bold "git add ${STAGE_TARGETS}")"
if [[ "$install_claude" == true ]]; then
  echo "    3. Claude: open Claude Code — hooks are live via .claude/settings.json"
fi
if [[ "$install_opencode" == true ]]; then
  echo "    4. OpenCode: hooks are live via .opencode/settings.json"
fi
if [[ "$install_omx" == true ]]; then
  echo "    5. OMX: hooks are live via .omx/settings.json"
fi
echo ""
DOCS_LINE="README.md, ARCHITECTURE.md"
echo "  Docs: ${DOCS_LINE}"
echo ""
