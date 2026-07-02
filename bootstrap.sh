#!/usr/bin/env bash
# Base Harness — Bootstrap Installer
#
# Remote:  curl -sSL https://raw.githubusercontent.com/jeongminsang/base-harness/main/bootstrap.sh | bash
# Local:   bash bootstrap.sh

set -euo pipefail

HARNESS_VERSION="2.0.0"
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

if [[ "$UPDATE_MODE" == true ]]; then
  info "Cleaning up legacy harness paths and files..."
  rm -rf memory/debate/
  rm -f memory/notepad.md
  rm -f hooks/write-verified-complete.cjs
  rm -f .codex/commands/mark-verified.sh
  rm -f state/verified-complete.json
  rm -f .omc/state/verified-complete.json
  rm -f .omc/state/verified_complete.json
  ok "Legacy files cleaned up"
fi

echo ""

# ─── Step 2: Interactive configuration ───────────────────────────────────────

info "Project configuration"
echo ""

PRESET=$(prompt_choice "Stack preset" "vite | next-ts | vanilla-ts" "vite")
ADAPTERS=$(prompt_choice "Adapter install" "omc | omo | omx | codex | all" "all")
# NOTE: 'tsc -b --noEmit' errors (TS5094) on TypeScript <= 5.5 — default to
# plain '-b'; emit behavior belongs in tsconfig's "noEmit".
BUILD_CMD=$(prompt "Build check command" "./node_modules/.bin/tsc -b")
LINT_CMD=$(prompt "Lint command" "npx eslint")
SRC_DIR=$(prompt "Source directories (comma-separated)" "src/")
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
fetch_file "hooks/session-baseline.cjs"     "hooks/session-baseline.cjs"
fetch_file "hooks/stop-enforcer.cjs"        "hooks/stop-enforcer.cjs"
fetch_file "hooks/run-final-check.cjs"      "hooks/run-final-check.cjs"
fetch_file "hooks/on-failure.cjs"           "hooks/on-failure.cjs"
fetch_file "hooks/lib/l3-rules.cjs"         "hooks/lib/l3-rules.cjs"
fetch_file "hooks/lib/final-gate.cjs"       "hooks/lib/final-gate.cjs"
# l3-local.cjs is project-owned (promotion ladder target) — install once, never overwrite.
if [[ ! -f "hooks/lib/l3-local.cjs" ]]; then
  fetch_file "hooks/lib/l3-local.cjs" "hooks/lib/l3-local.cjs"
fi
ok "Common hook files installed"

# ─── Step 3b: Install Git Pre-Commit Gate ─────────────────────────────────────

info "Installing Git Pre-Commit Gate..."
mkdir -p hooks/git
fetch_file "hooks/git/pre-commit" "hooks/git/pre-commit"
chmod +x hooks/git/pre-commit

# Don't silently kill an existing hook setup (husky etc.) — core.hooksPath is
# exclusive, so overriding it disables whatever ran there before.
EXISTING_HOOKS_PATH="$(git config core.hooksPath 2>/dev/null || true)"
if { [[ -n "$EXISTING_HOOKS_PATH" && "$EXISTING_HOOKS_PATH" != "hooks/git" ]]; } || { [[ -z "$EXISTING_HOOKS_PATH" && -d ".husky" ]]; }; then
  warn "Existing git hook setup detected (core.hooksPath='${EXISTING_HOOKS_PATH:-unset}'$([[ -d .husky ]] && echo ", .husky/ present"))"
  if prompt_yn "Override core.hooksPath to hooks/git? (existing hooks will stop running)" "n"; then
    git config core.hooksPath hooks/git
  else
    warn "Skipped core.hooksPath. Chain manually: call 'hooks/git/pre-commit' from your existing pre-commit hook."
  fi
else
  git config core.hooksPath hooks/git
fi

if [[ -f "package.json" ]]; then
  HAS_PREPARE=$(node -e "
    try {
      const pkg = JSON.parse(require('fs').readFileSync('package.json', 'utf8'));
      console.log(!!(pkg.scripts && pkg.scripts.prepare));
    } catch {
      console.log('false');
    }
  ")
  if [[ "$HAS_PREPARE" == "false" ]]; then
    if npm pkg set scripts.prepare="git config core.hooksPath hooks/git" >/dev/null 2>&1; then
      ok "scripts.prepare set to Git hooks path"
    else
      warn "Failed to set scripts.prepare automatically. Please add '\"prepare\": \"git config core.hooksPath hooks/git\"' to your package.json scripts."
    fi
  else
    warn "Existing prepare script detected in package.json. Please ensure 'git config core.hooksPath hooks/git' is run during prepare/postinstall."
  fi
else
  info "No package.json found. Run 'git config core.hooksPath hooks/git' manually in new clones."
fi
ok "Git pre-commit gate installed"

info "Installing agent personas..."
mkdir -p agents
for agent in architect critic analyst executor reviewer learner; do
  fetch_file "agents/${agent}.md" "agents/${agent}.md"
done
ok "Agents installed"

# ─── Step 4: Apply preset ─────────────────────────────────────────────────────

info "Applying preset: ${PRESET}..."
if [[ -f "hooks/lib/l3-preset.cjs" ]]; then
  # Never silently destroy locally-added rules: back up before refreshing and
  # point the user at l3-local.cjs, the file updates never touch.
  _TMP_PRESET="$(mktemp)"
  fetch_preset_file "$PRESET" "$_TMP_PRESET"
  if ! cmp -s "$_TMP_PRESET" "hooks/lib/l3-preset.cjs"; then
    cp "hooks/lib/l3-preset.cjs" "hooks/lib/l3-preset.cjs.bak"
    warn "hooks/lib/l3-preset.cjs differed from the template — backup saved to l3-preset.cjs.bak"
    warn "Project-owned rules belong in hooks/lib/l3-local.cjs (never overwritten by updates)."
  fi
  mv "$_TMP_PRESET" "hooks/lib/l3-preset.cjs"
else
  fetch_preset_file "$PRESET" "hooks/lib/l3-preset.cjs"
fi
ok "Preset ${PRESET} → hooks/lib/l3-preset.cjs"

# ─── Step 5: Write config.json ────────────────────────────────────────────────

info "Writing hooks/config.json..."
# JSON.stringify via node — a heredoc breaks as soon as a value contains a
# double quote; env passing needs no shell escaping at all.
CFG_PRESET="$PRESET" CFG_ADAPTERS="$ADAPTERS" CFG_BUILD="$BUILD_CMD" CFG_LINT="$LINT_CMD" \
CFG_SRC="$SRC_DIR" CFG_ARCH="$ARCH_JSON" CFG_MINDIFF="$MIN_DIFF" node -e '
const fs = require("fs");
const src = process.env.CFG_SRC.split(",").map((s) => s.trim()).filter(Boolean);
const cfg = {
  version: "0.1",
  preset: process.env.CFG_PRESET,
  adapters: process.env.CFG_ADAPTERS,
  buildCheckCmd: process.env.CFG_BUILD,
  lintCmd: process.env.CFG_LINT,
  srcDir: src.length === 1 ? src[0] : src,
  archTriggerPaths: JSON.parse(process.env.CFG_ARCH),
  qaTriggerMinLines: 50,
  qualityGate: {
    minDiffLines: Number(process.env.CFG_MINDIFF) || 10,
    rejectWhitespaceOnly: true,
    rejectIfDuplicateSkill: true,
  },
};
fs.writeFileSync("hooks/config.json", JSON.stringify(cfg, null, 2) + "\n");
'
ok "hooks/config.json written"

# ─── Step 6: Install adapters ────────────────────────────────────────────────

install_claude=false
install_opencode=false
install_omx=false
install_codex=false
case "$ADAPTERS" in
  omc)      install_claude=true ;;
  omo)      install_opencode=true ;;
  omx)      install_omx=true ;;
  codex)    install_codex=true ;;
  all)      install_claude=true; install_opencode=true; install_omx=true; install_codex=true ;;
  *)
    warn "Unknown adapter choice '${ADAPTERS}' — defaulting to all"
    install_claude=true
    install_opencode=true
    install_omx=true
    install_codex=true
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

if [[ "$install_codex" == true ]]; then
  info "Installing Codex adapter..."
  mkdir -p .codex/commands
  fetch_file ".codex/README.md" ".codex/README.md"
  fetch_file ".codex/commands/preflight.sh" ".codex/commands/preflight.sh"
  fetch_file ".codex/commands/post-task.sh" ".codex/commands/post-task.sh"
  fetch_file ".codex/commands/final-check.sh" ".codex/commands/final-check.sh"
  chmod +x .codex/commands/preflight.sh .codex/commands/post-task.sh .codex/commands/final-check.sh
  ok "Codex adapter ready"
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
  # Only the managed block — content after END in the template (e.g. the §11
  # skeleton) must not be re-appended over the user's preserved section.
  _AGENTS_NEW=$(_render_agents_tpl | awk '/<!-- HARNESS:MANAGED:START -->/{found=1} found{print} /<!-- HARNESS:MANAGED:END -->/{if (found) exit}')
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
  "memory/project-memory.json"
  ".omc/state/"
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
if [[ "$install_codex" == true ]]; then
  STAGE_TARGETS="${STAGE_TARGETS} .codex/"
fi
echo "  Next steps:"
echo "    - Review $(bold 'AGENTS.md') — add your stack-specific notes"
echo "      (프로젝트 고유 섹션은 CLAUDE.md에 단일 소스로 두고 AGENTS.md에서 참조하는 패턴 권장)"
echo "    - Stage:  $(bold "git add ${STAGE_TARGETS}")"
if [[ "$install_claude" == true ]]; then
  echo "    - Claude: open Claude Code — hooks are live via .claude/settings.json"
fi
if [[ "$install_opencode" == true ]]; then
  echo "    - OpenCode: hooks are live via .opencode/settings.json"
fi
if [[ "$install_omx" == true ]]; then
  echo "    - OMX: hooks are live via .omx/settings.json"
fi
if [[ "$install_codex" == true ]]; then
  echo "    - Codex: commands are live via .codex/commands/"
fi
echo "    - 커밋 게이트 활성화됨 — 다른 클론은 install 시 자동"
echo ""
DOCS_LINE="README.md, ARCHITECTURE.md"
echo "  Docs: ${DOCS_LINE}"
echo ""
