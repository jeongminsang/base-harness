"use strict";

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const { checkL3, ROOT } = require("./l3-rules.cjs");

function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(path.join(__dirname, "../config.json"), "utf8"));
  } catch {
    return {};
  }
}

function shell(cmd, cwd, timeout) {
  return execSync(cmd, { cwd, encoding: "utf8", timeout });
}

function getChangedFiles(srcDir) {
  let changedFiles = [];
  let untrackedFiles = [];

  let hasHead = false;
  try {
    shell("git rev-parse --verify HEAD >/dev/null 2>&1", ROOT);
    hasHead = true;
  } catch {}

  if (hasHead) {
    const modified = shell(`git diff --name-only HEAD -- ${srcDir}`, ROOT).trim();
    if (modified) changedFiles = modified.split("\n").filter(Boolean);
  }

  const untracked = shell(`git ls-files --others --exclude-standard -- ${srcDir}`, ROOT).trim();
  if (untracked) untrackedFiles = untracked.split("\n").filter(Boolean);

  return {
    changedFiles,
    untrackedFiles,
    // git diff --name-only also lists deleted files; passing one to eslint is
    // a hard error (exit 2) that made deletion commits impossible to gate.
    allChanged: [...changedFiles, ...untrackedFiles].filter(
      (f) => /\.(tsx?|jsx?)$/.test(f) && fs.existsSync(path.join(ROOT, f))
    ),
  };
}

function evaluateFinalGate() {
  const cfg = loadConfig();
  // NOTE: `tsc -b --noEmit` errors with TS5094 on TypeScript <= 5.5 — keep
  // the default to plain `-b` (emit behavior belongs in tsconfig's noEmit).
  const buildCheckCmd = cfg.buildCheckCmd || "./node_modules/.bin/tsc -b";
  const lintCmd = cfg.lintCmd || "npx eslint";
  const srcDir = cfg.srcDir || "src/";

  let files;
  try {
    files = getChangedFiles(srcDir);
  } catch {
    return { ok: true, skipped: true, reason: "Could not read git diff state." };
  }

  if (files.allChanged.length === 0) {
    return { ok: true, skipped: true, reason: "No changed source files." };
  }

  const allViolations = [];
  for (const relPath of files.allChanged) {
    const absPath = path.join(ROOT, relPath);
    let content = "";
    try {
      content = fs.readFileSync(absPath, "utf8");
    } catch {
      continue;
    }
    const isNewFile = files.untrackedFiles.includes(relPath);
    const violations = checkL3(relPath, content, { isNewFile });
    if (violations.length > 0) allViolations.push({ file: relPath, violations });
  }

  if (allViolations.length > 0) {
    const lines = allViolations.flatMap(({ file, violations }) => [
      `File: ${file}`,
      ...violations.map((v) => `  - [${v.skill}] ${v.detail}`),
      "",
    ]);
    return {
      ok: false,
      gate: 1,
      reason: `[Harness] L3 violations detected\n\n${lines.join("\n")}`.trim(),
    };
  }

  try {
    shell(buildCheckCmd, ROOT, 90000);
  } catch (e) {
    const out = ((e.stdout || "") + (e.stderr || "")).slice(0, 2000);
    // TS5xxx are command-line/config errors (e.g. TS5094: '--noEmit' with
    // '--build' on TS <= 5.5), not type errors. Route the fix to config.json
    // instead of sending the model off to "fix" healthy source code.
    if (/error TS5\d{3}\b|Unknown compiler option|command not found|ENOENT/i.test(out + (e.code || ""))) {
      return {
        ok: false,
        gate: 2,
        reason: `[Gate misconfig] buildCheckCmd (${buildCheckCmd}) itself failed to run — fix hooks/config.json, not the source.\n\n${out}`.trim(),
      };
    }
    return {
      ok: false,
      gate: 2,
      reason: `[Type error] ${buildCheckCmd} failed.\n\n${out}`.trim(),
    };
  }

  try {
    shell(`${lintCmd} ${files.allChanged.join(" ")}`, ROOT, 60000);
  } catch (e) {
    const out = ((e.stdout || "") + (e.stderr || "")).slice(0, 2000);
    return {
      ok: false,
      gate: 3,
      reason: `[Lint error] ${lintCmd} failed.\n\n${out}`.trim(),
    };
  }

  return {
    ok: true,
    files: files.allChanged,
  };
}

module.exports = { evaluateFinalGate, loadConfig };
