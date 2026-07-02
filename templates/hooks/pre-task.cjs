#!/usr/bin/env node
// pre-task.js — SLL Pre hook
// USAGE: node hooks/pre-task.js "<task text>"
// OUT:   cats top-K matching skill files to stdout, wrapped for CTX injection.

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SKILLS = path.join(ROOT, "skills");
const K = 3;

let CFG = {};
try { CFG = JSON.parse(fs.readFileSync(path.join(__dirname, "config.json"), "utf8")); } catch {}
const SRC_DIR = CFG.srcDir || "src/";

// 프로젝트 소스 파일 판정 — srcDir은 preset마다 다르므로(config.json) 하드코딩하지 않는다.
// ROOT와 file_path의 symlink 표기가 어긋날 수 있어(macOS /tmp 등) 양쪽 다 realpath로 정규화.
const REAL_ROOT = (() => { try { return fs.realpathSync(ROOT); } catch { return ROOT; } })();
function isProjectSource(filePath) {
  if (!/\.(tsx?|jsx?)$/.test(filePath)) return false;
  let abs = path.resolve(REAL_ROOT, filePath);
  try { abs = path.join(fs.realpathSync(path.dirname(abs)), path.basename(abs)); } catch {}
  const rel = path.relative(REAL_ROOT, abs);
  return !rel.startsWith("..") && rel.startsWith(SRC_DIR);
}

// Adapter hook path: stdin JSON → tool_input 텍스트 추출
// CLI/manual path (Codex preflight.sh 등): process.argv 그대로 사용
const isCliMode = process.argv.length > 2;
let task = process.argv.slice(2).join(" ").toLowerCase();
let sessionId = null;
if (!task && !process.stdin.isTTY) {
  try {
    const raw = fs.readFileSync("/dev/stdin", "utf8");
    const payload = JSON.parse(raw);
    sessionId = payload.session_id || null;
    const ti = payload.tool_input || {};
    // 프로젝트 소스 파일 대상일 때만 주입 — 레포 밖/비소스 파일 쓰기에
    // 컨벤션 스킬을 주입하는 것은 컨텍스트 노이즈다 (enforcer와 동일 기준)
    if (ti.file_path && !isProjectSource(ti.file_path)) {
      process.exit(0);
    }
    task = [
      ti.file_path || "",
      ti.content || "",
      ti.new_string || "",
      ti.command || "",
    ].join(" ").toLowerCase();
  } catch {}
}
if (!task) {
  console.error("[pre-task] no task text; exit.");
  process.exit(0);
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    const s = fs.statSync(p);
    if (s.isDirectory()) walk(p, out);
    // DRAFT-FIRST: .draft.md는 사람 승격(.md로 rename) 전까지 절대 주입하지
    // 않는다 — 자동 채굴 draft는 광범위한 트리거로 raw diff를 계속 흘려보낸다.
    else if (f === "SKILL.md" || (f.endsWith(".md") && !f.endsWith(".draft.md"))) out.push(p);
  }
  return out;
}

function parseFrontmatter(txt) {
  const m = txt.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return { triggers: [] };
  const body = m[1];
  const tm = body.match(/triggers:\s*\[([^\]]*)\]/);
  const triggers = tm
    ? tm[1].split(",").map(s => s.trim().replace(/^["']|["']$/g, "").toLowerCase()).filter(Boolean)
    : [];
  return { triggers };
}

const scored = [];
for (const file of walk(SKILLS)) {
  const txt = fs.readFileSync(file, "utf8");
  const { triggers } = parseFrontmatter(txt);
  let score = 0;
  for (const t of triggers) if (t && task.includes(t)) score += 1;
  if (score > 0) scored.push({ file, score, txt });
}

scored.sort((a, b) => b.score - a.score);
const top = scored.slice(0, K);

if (!top.length) {
  console.error("[pre-task] no skill matched; exit.");
  process.exit(0);
}

// Session-scoped dedup: 한 번 주입된 스킬은 대화 컨텍스트에 계속 남으므로
// 같은 세션에서 재주입하는 것은 토큰 낭비다. CLI 경로(session_id 없음)는
// 매 실행이 독립이므로 dedup하지 않는다.
let toInject = top;
if (sessionId) {
  const STATE = path.join(ROOT, ".omc", "state", "injected-skills.json");
  let state = { sessions: {} };
  try { state = JSON.parse(fs.readFileSync(STATE, "utf8")); } catch {}
  if (!state.sessions) state = { sessions: {} };
  const entry = state.sessions[sessionId] || { skills: [], updatedAt: 0 };
  const seen = new Set(entry.skills);
  toInject = top.filter(({ file }) => !seen.has(path.relative(ROOT, file)));
  if (!toInject.length) {
    console.error("[pre-task] matched skills already injected this session; exit.");
    process.exit(0);
  }
  entry.skills = [...seen, ...toInject.map(({ file }) => path.relative(ROOT, file))];
  entry.updatedAt = Date.now();
  state.sessions[sessionId] = entry;
  // 최근 5개 세션만 유지 (파일 무한 성장 방지)
  const keep = Object.keys(state.sessions)
    .sort((a, b) => (state.sessions[b].updatedAt || 0) - (state.sessions[a].updatedAt || 0))
    .slice(0, 5);
  state.sessions = Object.fromEntries(keep.map((id) => [id, state.sessions[id]]));
  try {
    fs.mkdirSync(path.dirname(STATE), { recursive: true });
    fs.writeFileSync(STATE, JSON.stringify(state));
  } catch {}
}

const MAX_SKILL_CHARS = 4000;
const parts = ['<harness-ctx source="pre-task.cjs">'];
for (const { file, score, txt } of toInject) {
  parts.push(`\n<!-- skill: ${path.relative(ROOT, file)} score=${score} -->`);
  parts.push(txt.length > MAX_SKILL_CHARS ? txt.slice(0, MAX_SKILL_CHARS) + "\n…(truncated)" : txt);
}
parts.push("</harness-ctx>");

if (isCliMode) {
  // CLI 경로(Codex preflight.sh)는 stdout이 그대로 컨텍스트로 읽히므로 plain text.
  console.log(parts.join("\n"));
} else {
  // PreToolUse 훅의 plain stdout은 모델 컨텍스트에 주입되지 않는다(transcript 전용).
  // 컨텍스트 주입은 hookSpecificOutput.additionalContext JSON으로만 동작한다.
  console.log(JSON.stringify({
    continue: true,
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      additionalContext: parts.join("\n"),
    },
  }));
}
