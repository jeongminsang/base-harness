"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execSync } = require("child_process");
const { checkL3, ROOT } = require("./l3-rules.cjs");

function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(path.join(__dirname, "../config.json"), "utf8"));
  } catch {
    return {};
  }
}

// srcDir accepts a string or an array (e.g. a Next.js repo with app/ and src/).
function srcDirsOf(cfg) {
  const raw = cfg.srcDir || "src/";
  return (Array.isArray(raw) ? raw : [raw])
    .filter(Boolean)
    .map((d) => (d.endsWith("/") ? d : `${d}/`));
}

function shell(cmd, cwd, timeout) {
  return execSync(cmd, { cwd, encoding: "utf8", timeout });
}

function sha1(buf) {
  return crypto.createHash("sha1").update(buf).digest("hex");
}

function getChangedFiles(srcDirs, { staged = false } = {}) {
  const pathspec = srcDirs.map((d) => `"${d}"`).join(" ");
  let changedFiles = [];
  let untrackedFiles = [];

  let hasHead = false;
  try {
    shell("git rev-parse --verify HEAD >/dev/null 2>&1", ROOT);
    hasHead = true;
  } catch {}

  if (staged) {
    // Validate the index — what the commit will actually contain — not the
    // working tree; partial staging (git add -p) makes the two diverge.
    const cmd = hasHead
      ? `git diff --cached --name-only --diff-filter=d -- ${pathspec}`
      : `git ls-files --cached -- ${pathspec}`;
    const out = shell(cmd, ROOT).trim();
    if (out) changedFiles = out.split("\n").filter(Boolean);
  } else {
    if (hasHead) {
      const modified = shell(`git diff --name-only HEAD -- ${pathspec}`, ROOT).trim();
      if (modified) changedFiles = modified.split("\n").filter(Boolean);
    }
    const untracked = shell(`git ls-files --others --exclude-standard -- ${pathspec}`, ROOT).trim();
    if (untracked) untrackedFiles = untracked.split("\n").filter(Boolean);
  }

  return {
    changedFiles,
    untrackedFiles,
    // git diff also lists deleted paths; passing one to eslint is a hard
    // error (exit 2) that made deletion commits impossible to gate.
    allChanged: [...changedFiles, ...untrackedFiles].filter(
      (f) => /\.(tsx?|jsx?)$/.test(f) && fs.existsSync(path.join(ROOT, f))
    ),
  };
}

// opts.staged        — validate index content (pre-commit path).
// opts.baselineFiles — { relPath: sha1 } snapshot taken at session start; files
//                      still matching their baseline hash are the user's WIP,
//                      not this session's output, and are excluded (stop path).
function evaluateFinalGate(opts = {}) {
  const cfg = loadConfig();
  // NOTE: `tsc -b --noEmit` errors with TS5094 on TypeScript <= 5.5 — keep
  // the default to plain `-b` (emit behavior belongs in tsconfig's noEmit).
  const buildCheckCmd = cfg.buildCheckCmd || "./node_modules/.bin/tsc -b";
  const lintCmd = cfg.lintCmd || "npx eslint";
  const srcDirs = srcDirsOf(cfg);

  let files;
  try {
    files = getChangedFiles(srcDirs, { staged: !!opts.staged });
  } catch {
    return { ok: true, skipped: true, reason: "Could not read git diff state." };
  }

  let checkList = files.allChanged;

  if (opts.baselineFiles) {
    checkList = checkList.filter((f) => {
      const base = opts.baselineFiles[f];
      if (!base) return true;
      try {
        return sha1(fs.readFileSync(path.join(ROOT, f))) !== base;
      } catch {
        return true;
      }
    });
  }

  if (checkList.length === 0) {
    return { ok: true, skipped: true, reason: "No changed source files." };
  }

  let stagedNewFiles = null;
  if (opts.staged) {
    try {
      const out = shell("git diff --cached --name-only --diff-filter=A", ROOT).trim();
      stagedNewFiles = new Set(out ? out.split("\n").filter(Boolean) : []);
    } catch {
      stagedNewFiles = new Set();
    }
  }

  const allViolations = [];
  for (const relPath of checkList) {
    let content = "";
    if (opts.staged) {
      // Read from the index, not the working tree.
      try {
        content = shell(`git show ":${relPath}"`, ROOT);
      } catch {
        continue;
      }
    } else {
      try {
        content = fs.readFileSync(path.join(ROOT, relPath), "utf8");
      } catch {
        continue;
      }
    }
    const isNewFile = opts.staged
      ? stagedNewFiles.has(relPath)
      : files.untrackedFiles.includes(relPath);
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
    shell(`${lintCmd} ${checkList.map((f) => `"${f}"`).join(" ")}`, ROOT, 60000);
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
    files: checkList,
  };
}

module.exports = { evaluateFinalGate, loadConfig, getChangedFiles, srcDirsOf };
