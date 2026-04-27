#!/usr/bin/env node
// on-failure.js — SLL failure hook
// USAGE: node hooks/on-failure.js "<symptom>" "<trace-or-msg>"
// OUT:   skills/fixes/<date>-<slug>.draft.md

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const FIX = path.join(ROOT, "skills", "fixes");

const [, , symptomArg, traceArg] = process.argv;
const symptom = symptomArg || "unknown-failure";
const trace = traceArg || "";

const date = new Date().toISOString().slice(0, 10);
const slug = symptom.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40);
const file = path.join(FIX, `${date}-${slug}.draft.md`);

fs.mkdirSync(FIX, { recursive: true });
fs.writeFileSync(file, `---
name: ${date}-${slug}
triggers: ["${slug.split("-").filter(Boolean).join('", "')}"]
status: draft
---

# ${symptom}

## Symptom
${symptom}

## Trace / Message
\`\`\`
${trace || "(fill in)"}
\`\`\`

## Root cause
(fill in)

## Patch / Fix
(fill in; reference commit SHA)

## Prevent next time
(pre-task.js will inject this on trigger match)
`);

console.log(`[on-failure] wrote ${path.relative(ROOT, file)}`);
