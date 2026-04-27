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
const SRC_DIR = CFG.srcDir || "src/";

function sh(cmd) {
  try { return execSync(cmd, { cwd: ROOT, encoding: "utf8" }); }
  catch { return ""; }
}

const diff = sh("git diff HEAD");
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

// ARCH-TRIGGER
const ARCH_PATHS = CFG.archTriggerPaths || [`${SRC_DIR}pages/`, `${SRC_DIR}components/`];
const isArchTrigger = files.some(f => ARCH_PATHS.some(p => f.startsWith(p)));
if (isArchTrigger) {
  const DEBATE = path.join(ROOT, CFG.debateLedger || "memory/debate/rounds.json");
  let ledger = { schema: "1.0", rounds: [] };
  if (fs.existsSync(DEBATE)) { try { ledger = JSON.parse(fs.readFileSync(DEBATE, "utf8")); } catch {} }
  const commit = sh("git rev-parse --short HEAD").trim();
  const id = String(ledger.rounds.length + 1).padStart(3, "0");
  ledger.rounds.push({
    id,
    task: `post-task auto @ ${commit}`,
    state: "PROPOSED",
    proposal: { agent: "architect", content: lines.slice(0, 40).join("\n") },
    challenges: [],
    consensus: null,
  });
  fs.mkdirSync(path.dirname(DEBATE), { recursive: true });
  fs.writeFileSync(DEBATE, JSON.stringify(ledger, null, 2));
  console.log(`[post-task] debate round-${id} created (PROPOSED)`);
}

// Heuristic bucket matching — driven by srcDir
let bucket = null, slug = null, triggers = [];
for (const f of files) {
  if (f.startsWith(`${SRC_DIR}validation/`)) { bucket = "conventions"; slug = "zod-schema-" + path.basename(f, path.extname(f)); triggers = ["zod", "schema", "validation"]; break; }
  if (f.startsWith(`${SRC_DIR}api/`))        { bucket = "libraries";  slug = "api-" + path.basename(f, path.extname(f)); triggers = ["api", "http", path.basename(f, path.extname(f))]; break; }
  if (f.startsWith(`${SRC_DIR}hooks/`))      { bucket = "components"; slug = "hook-" + path.basename(f, path.extname(f)); triggers = ["hook", path.basename(f, path.extname(f))]; break; }
  if (f.startsWith(`${SRC_DIR}components/`)) { bucket = "components"; slug = "cmp-" + path.basename(f, path.extname(f)); triggers = ["component", path.basename(f, path.extname(f))]; break; }
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

Auto-mined from diff at \`${commit}\`. Touched files:
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
