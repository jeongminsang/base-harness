#!/usr/bin/env node
// pre-task.cjs — SLL Pre hook
// USAGE (CLI):  node hooks/pre-task.cjs "<task text>"
// USAGE (Hook): stdin JSON -> JSON line output

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SKILLS = path.join(ROOT, "skills");
const K = 3;

// Resolve CLI vs Hook mode
const args = process.argv.slice(2);
const isCliMode = args.length > 0;

let task = "";
let ti = {};

if (isCliMode) {
  task = args.join(" ").toLowerCase();
} else {
  // Hook mode
  try {
    const raw = fs.readFileSync("/dev/stdin", "utf8");
    const payload = JSON.parse(raw || "{}");
    ti = payload.tool_input || {};
    task = [
      ti.file_path || "",
      ti.content || "",
      ti.new_string || "",
      ti.command || "",
    ].join(" ").trim().toLowerCase();
  } catch (e) {
    // If parsing fails in hook mode, pass through
    console.log(JSON.stringify({ continue: true }));
    process.exit(0);
  }
}

// In hook mode, if file_path is present but it's a non-source file, pass through
if (!isCliMode && ti.file_path && !/\.(tsx?|jsx?)$/.test(ti.file_path)) {
  console.log(JSON.stringify({ continue: true }));
  process.exit(0);
}

if (!task) {
  if (isCliMode) {
    console.error("[pre-task] no task text; exit.");
    process.exit(0);
  } else {
    console.log(JSON.stringify({ continue: true }));
    process.exit(0);
  }
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
  if (isCliMode) {
    console.error("[pre-task] no skill matched; exit.");
    process.exit(0);
  } else {
    console.log(JSON.stringify({ continue: true }));
    process.exit(0);
  }
}

if (isCliMode) {
  console.log("<harness-ctx source=\"pre-task.js\">");
  for (const { file, score, txt } of top) {
    console.log(`\n<!-- skill: ${path.relative(ROOT, file)} score=${score} -->`);
    console.log(txt);
  }
  console.log("</harness-ctx>");
} else {
  // Hook mode JSON line output
  let additionalContext = '<harness-ctx source="pre-task.js">';
  for (const { file, score, txt } of top) {
    const truncatedTxt = txt.length > 4000 ? txt.slice(0, 4000) + "\n...[truncated]" : txt;
    additionalContext += `\n<!-- skill: ${path.relative(ROOT, file)} score=${score} -->\n${truncatedTxt}`;
  }
  additionalContext += '\n</harness-ctx>';

  console.log(JSON.stringify({
    continue: true,
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      additionalContext
    }
  }));
}
