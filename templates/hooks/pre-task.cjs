#!/usr/bin/env node
// pre-task.js — SLL Pre hook
// USAGE: node hooks/pre-task.js "<task text>"
// OUT:   cats top-K matching skill files to stdout, wrapped for CTX injection.

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SKILLS = path.join(ROOT, "skills");
const K = 3;

// Claude Code hook: stdin JSON → tool_input 텍스트 추출
// CLI 수동 호출: process.argv 그대로 사용
let task = process.argv.slice(2).join(" ").toLowerCase();
if (!task && !process.stdin.isTTY) {
  try {
    const raw = fs.readFileSync("/dev/stdin", "utf8");
    const payload = JSON.parse(raw);
    const ti = payload.tool_input || {};
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
    else if (f === "SKILL.md" || f.endsWith(".draft.md")) out.push(p);
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

console.log("<harness-ctx source=\"pre-task.js\">");
for (const { file, score, txt } of top) {
  console.log(`\n<!-- skill: ${path.relative(ROOT, file)} score=${score} -->`);
  console.log(txt);
}

// Debate round injection
const DEBATE = path.join(ROOT, "memory", "debate", "rounds.json");
if (fs.existsSync(DEBATE)) {
  try {
    const { rounds } = JSON.parse(fs.readFileSync(DEBATE, "utf8"));
    const open = (rounds || []).filter(r => r.state !== "CONSENSUS");
    if (open.length > 0) {
      console.log("\n<!-- debate-active-rounds -->");
      for (const r of open) {
        const challengeLines = (r.challenges || []).flatMap(c =>
          (c.points || []).map(p => `  - ${p}`)
        ).join("\n");
        console.log(`[DEBATE-ACTIVE] round-${r.id} state=${r.state}
task: ${r.task}
proposal: ${r.proposal ? r.proposal.content : "(none)"}
challenges:\n${challengeLines || "  (none yet)"}`);
      }
    }
  } catch {}
}

console.log("</harness-ctx>");
