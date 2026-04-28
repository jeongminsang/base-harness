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
    allChanged: [...changedFiles, ...untrackedFiles].filter((f) => /\.(tsx?|jsx?)$/.test(f)),
  };
}

function getVerifiedPaths(cfg) {
  const configured = cfg.verifiedCompletePath || "../state/verified-complete.json";
  return [
    path.join(ROOT, configured),
    path.join(ROOT, ".omc/state/verified_complete.json"),
  ];
}

function evaluateFinalGate() {
  const cfg = loadConfig();
  const buildCheckCmd = cfg.buildCheckCmd || "yarn tsc --noEmit";
  const lintCmd = cfg.lintCmd || "npx eslint";
  const srcDir = cfg.srcDir || "src/";
  const debatePath = path.join(ROOT, cfg.debateLedger || "memory/debate/rounds.json");

  if (fs.existsSync(debatePath)) {
    try {
      const { rounds } = JSON.parse(fs.readFileSync(debatePath, "utf8"));
      const openRounds = (rounds || []).filter((r) => r.state === "PROPOSED");
      if (openRounds.length > 0) {
        return {
          ok: false,
          gate: 0,
          reason:
            `[Harness] Open PROPOSED debate round(s): ${openRounds.map((r) => r.id).join(", ")}\n\n` +
            "Launch a fresh critic agent using agents/critic.md before finishing.\n" +
            "See AGENTS.md §9 for the anti-self-consistency rule.",
        };
      }
    } catch {}
  }

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
    shell(buildCheckCmd, ROOT, 30000);
  } catch (e) {
    const out = ((e.stdout || "") + (e.stderr || "")).slice(0, 2000);
    return {
      ok: false,
      gate: 2,
      reason: `[Type error] ${buildCheckCmd} failed.\n\n${out}`.trim(),
    };
  }

  try {
    shell(`${lintCmd} ${files.allChanged.join(" ")}`, ROOT, 20000);
  } catch (e) {
    const out = ((e.stdout || "") + (e.stderr || "")).slice(0, 2000);
    return {
      ok: false,
      gate: 3,
      reason: `[Lint error] ${lintCmd} failed.\n\n${out}`.trim(),
    };
  }

  let verified = false;
  let matchedPath = null;
  for (const verifiedPath of getVerifiedPaths(cfg)) {
    try {
      const vf = JSON.parse(fs.readFileSync(verifiedPath, "utf8"));
      const verifiedSet = new Set(vf.verifiedFiles || []);
      if (files.allChanged.every((f) => verifiedSet.has(f))) {
        verified = true;
        matchedPath = verifiedPath;
        break;
      }
    } catch {}
  }

  if (!verified) {
    const canonical = cfg.verifiedCompletePath || "../state/verified-complete.json";
    return {
      ok: false,
      gate: 4,
      reason:
        "[Harness] Syntax checks passed but logic verification is not recorded.\n" +
        "Write the canonical verifier artifact after your verification pass:\n\n" +
        JSON.stringify(
          {
            verifiedAt: new Date().toISOString(),
            verifiedFiles: files.allChanged,
            verifier: "reviewer-or-verifier",
          },
          null,
          2
        ) +
        `\n\nTarget path: ${canonical}`,
    };
  }

  return {
    ok: true,
    verifiedPath: matchedPath,
    files: files.allChanged,
  };
}

module.exports = { evaluateFinalGate, loadConfig, getVerifiedPaths };
