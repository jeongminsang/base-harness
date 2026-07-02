#!/usr/bin/env node
// post-task.cjs — SLL Post hook: diff mining + skill drafting

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const SKILLS = path.join(ROOT, "skills");
const MEM = path.join(ROOT, "memory", "project-memory.json");
const CFG = JSON.parse(fs.readFileSync(path.join(__dirname, "config.json"), "utf8"));
const QG = CFG.qualityGate;
// srcDir은 문자열 또는 배열(예: Next.js의 app/ + src/) 모두 허용.
const SRC_DIRS = (Array.isArray(CFG.srcDir) ? CFG.srcDir : [CFG.srcDir || "src/"])
  .filter(Boolean)
  .map((d) => (d.endsWith("/") ? d : `${d}/`));

function sh(cmd) {
  try { return execSync(cmd, { cwd: ROOT, encoding: "utf8" }); }
  catch { return ""; }
}

// pre-commit 시점에는 커밋될 내용(index)을 채굴한다; staged가 없으면 워킹트리 fallback.
let diff = sh("git diff --cached");
if (!diff.trim()) diff = sh("git diff HEAD");
if (!diff.trim()) { console.error("[post-task] empty diff; exit."); process.exit(0); }

const lines = diff.split("\n");
const addRm = lines.filter(l => /^[+-][^+-]/.test(l));
if (addRm.length < QG.minDiffLines) {
  console.error(`[post-task] QG reject: diff<${QG.minDiffLines} LOC (${addRm.length}).`); process.exit(0);
}
if (QG.rejectWhitespaceOnly && addRm.every(l => /^[+-]\s*$/.test(l))) {
  console.error("[post-task] QG reject: whitespace-only."); process.exit(0);
}

const files = [...diff.matchAll(/^\+\+\+ b\/(\S+)/gm)].map(m => m[1]);

// Heuristic bucket matching — driven by srcDir
let bucket = null, slug = null, triggers = [];
outer: for (const f of files) {
  for (const d of SRC_DIRS) {
    if (!f.startsWith(d)) continue;
    if (f.startsWith(`${d}validation/`)) { bucket = "conventions"; slug = "zod-schema-" + path.basename(f, path.extname(f)); triggers = ["zod", "schema", "validation"]; break outer; }
    if (f.startsWith(`${d}api/`))        { bucket = "libraries";  slug = "api-" + path.basename(f, path.extname(f)); triggers = ["api", "http", path.basename(f, path.extname(f))]; break outer; }
    if (f.startsWith(`${d}hooks/`))      { bucket = "components"; slug = "hook-" + path.basename(f, path.extname(f)); triggers = ["hook", path.basename(f, path.extname(f))]; break outer; }
    if (f.startsWith(`${d}components/`)) { bucket = "components"; slug = "cmp-" + path.basename(f, path.extname(f)); triggers = ["component", path.basename(f, path.extname(f))]; break outer; }
  }
}
if (!bucket) { console.error("[post-task] no bucket matched; exit."); process.exit(0); }

// Duplicate check
if (QG.rejectIfDuplicateSkill) {
  const existing = fs.existsSync(path.join(SKILLS, bucket)) ? fs.readdirSync(path.join(SKILLS, bucket)) : [];
  if (existing.some(n => n.includes(slug))) {
    console.error(`[post-task] QG reject: duplicate skill '${slug}'.`); process.exit(0);
  }
}

const outDir = path.join(SKILLS, bucket);
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, `${slug}.draft.md`);
const commit = sh("git rev-parse --short HEAD").trim();

fs.writeFileSync(outFile, `---
name: ${slug}
triggers: [${triggers.map(t => `"${t}"`).join(", ")}]
files: [${files.map(f => `"${f}"`).join(", ")}]
status: draft
source_commit: ${commit}
---

# ${slug} (DRAFT)

Auto-mined at pre-commit (parent commit \`${commit}\` — the new commit SHA
does not exist yet at mining time). Touched files:
${files.map(f => `- \`${f}\``).join("\n")}

## Diff excerpt (first 40 lines)
\`\`\`diff
${lines.slice(0, 40).join("\n")}
\`\`\`

## TODO (human)
- [ ] Summarize the pattern in 1 line.
- [ ] Add canonical snippet + anti-pattern.
- [ ] Rename from \`.draft.md\` to \`.md\` to activate.
`);

let mem = { facts: [], skills: [] };
if (fs.existsSync(MEM)) { try { mem = JSON.parse(fs.readFileSync(MEM, "utf8")); } catch {} }
mem.skills.push({ ts: new Date().toISOString(), commit, skill: path.relative(ROOT, outFile) });
fs.mkdirSync(path.dirname(MEM), { recursive: true });
fs.writeFileSync(MEM, JSON.stringify(mem, null, 2));

console.log(`[post-task] drafted ${path.relative(ROOT, outFile)}`);
