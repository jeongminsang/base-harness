#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const { checkL3, ROOT } = require("./lib/l3-rules.cjs");

let CFG = {};
try { CFG = JSON.parse(fs.readFileSync(path.join(__dirname, "config.json"), "utf8")); } catch {}

const BUILD_CHECK_CMD = CFG.buildCheckCmd || "yarn tsc --noEmit";
const LINT_CMD = CFG.lintCmd || "npx eslint";
const SRC_DIR = CFG.srcDir || "src/";

let raw = "";
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => {
  let data = {};
  try {
    data = JSON.parse(raw || "{}");
  } catch {
    console.log(JSON.stringify({ continue: true, suppressOutput: true }));
    return;
  }

  const stopReason = (data.stop_reason || "").toLowerCase();
  if (stopReason.includes("context_limit") || stopReason.includes("max_tokens")) {
    console.log(JSON.stringify({ continue: true, suppressOutput: true }));
    return;
  }

  if (data.user_requested || stopReason.includes("user_cancel")) {
    console.log(JSON.stringify({ continue: true, suppressOutput: true }));
    return;
  }

  // [gate 0] open PROPOSED debate round
  const debatePath = path.join(ROOT, CFG.debateLedger || "memory/debate/rounds.json");
  if (fs.existsSync(debatePath)) {
    try {
      const { rounds } = JSON.parse(fs.readFileSync(debatePath, "utf8"));
      const openRounds = (rounds || []).filter((r) => r.state === "PROPOSED");
      if (openRounds.length > 0) {
        const ids = openRounds.map((r) => r.id).join(", ");
        console.log(
          JSON.stringify({
            decision: "block",
            reason:
              `[Harness] Open PROPOSED debate round(s): ${ids}\n\n` +
              `Spawn critic Agent before exiting:\n` +
              `  Agent(subagent_type="oh-my-claudecode:critic", prompt="[proposal content]")\n\n` +
              `See AGENTS.md §11 — same-context critic analysis is prohibited.`,
          })
        );
        return;
      }
    } catch {}
  }

  // Collect changed src/ files
  let changedFiles = [];
  let untrackedFiles = [];
  try {
    const modified = execSync(`git diff --name-only HEAD -- ${SRC_DIR}`, {
      cwd: ROOT,
      encoding: "utf8",
    }).trim();
    if (modified) changedFiles = modified.split("\n").filter(Boolean);

    const untracked = execSync(
      `git ls-files --others --exclude-standard -- ${SRC_DIR}`,
      { cwd: ROOT, encoding: "utf8" }
    ).trim();
    if (untracked) untrackedFiles = untracked.split("\n").filter(Boolean);
  } catch {
    console.log(JSON.stringify({ continue: true, suppressOutput: true }));
    return;
  }

  const allChanged = [...changedFiles, ...untrackedFiles].filter(
    (f) => /\.(tsx?|jsx?)$/.test(f)
  );

  if (allChanged.length === 0) {
    console.log(JSON.stringify({ continue: true, suppressOutput: true }));
    return;
  }

  // [gate 1] L3 regex scan
  const allViolations = [];
  for (const relPath of allChanged) {
    const absPath = path.join(ROOT, relPath);
    let content = "";
    try { content = fs.readFileSync(absPath, "utf8"); } catch { continue; }
    const isNewFile = untrackedFiles.includes(relPath);
    const violations = checkL3(relPath, content, { isNewFile });
    if (violations.length > 0) allViolations.push({ file: relPath, violations });
  }

  if (allViolations.length > 0) {
    const lines = allViolations.flatMap(({ file, violations }) => [
      `📄 ${file}`,
      ...violations.map((v) => `  ❌ [${v.skill}] ${v.detail}`),
      "",
    ]);
    console.log(JSON.stringify({
      decision: "block",
      reason: `[Harness] L3 violations detected\n\n` + lines.join("\n") + `\nFix violations before exiting.`,
    }));
    return;
  }

  // [gate 2] build check
  try {
    execSync(BUILD_CHECK_CMD, { cwd: ROOT, encoding: "utf8", timeout: 30000 });
  } catch (e) {
    const out = ((e.stdout || "") + (e.stderr || "")).slice(0, 2000);
    console.log(JSON.stringify({
      decision: "block",
      reason: `[Type error] ${BUILD_CHECK_CMD} failed.\n\n${out}`,
    }));
    return;
  }

  // [gate 3] lint
  try {
    execSync(`${LINT_CMD} ${allChanged.join(" ")}`, {
      cwd: ROOT,
      encoding: "utf8",
      timeout: 20000,
    });
  } catch (e) {
    const out = ((e.stdout || "") + (e.stderr || "")).slice(0, 2000);
    console.log(JSON.stringify({
      decision: "block",
      reason: `[Lint error] ${LINT_CMD} failed.\n\n${out}`,
    }));
    return;
  }

  // [gate 4] verifier sign-off
  const verifiedPath = path.join(ROOT, ".omc/state/verified_complete.json");
  let isVerified = false;
  try {
    const vf = JSON.parse(fs.readFileSync(verifiedPath, "utf8"));
    const verifiedSet = new Set(vf.verifiedFiles || []);
    isVerified = allChanged.every((f) => verifiedSet.has(f));
  } catch {}

  if (!isVerified) {
    console.log(JSON.stringify({
      decision: "block",
      reason:
        "[Harness] Syntax checks passed but logic verification (Verifier) not done.\n" +
        "Run: Agent(subagent_type=\"oh-my-claudecode:verifier\")\n\n" +
        "Then write .omc/state/verified_complete.json:\n" +
        JSON.stringify({ verifiedAt: new Date().toISOString(), verifiedFiles: allChanged, verifier: "oh-my-claudecode:verifier" }, null, 2),
    }));
    return;
  }

  console.log(JSON.stringify({ continue: true, suppressOutput: true }));
});
