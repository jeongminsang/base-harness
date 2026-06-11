#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const { evaluateFinalGate, loadConfig } = require("./lib/final-gate.cjs");

const ROOT = (() => {
  const candidate = path.resolve(__dirname, "..");
  return path.basename(candidate) === "templates" ? path.dirname(candidate) : candidate;
})();

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

  const CFG = loadConfig();
  const attemptsPath = path.join(ROOT, ".omc", "state", "stop-gate-attempts.json");

  let attempts = { count: 0, updatedAt: new Date().toISOString() };
  if (fs.existsSync(attemptsPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(attemptsPath, "utf8"));
      if (parsed && typeof parsed.count === "number") {
        attempts.count = parsed.count;
      }
      if (parsed && parsed.updatedAt) {
        attempts.updatedAt = parsed.updatedAt;
        const elapsed = Date.now() - new Date(attempts.updatedAt).getTime();
        if (elapsed > 3600000) {
          attempts.count = 0;
          attempts.updatedAt = new Date().toISOString();
        }
      }
    } catch {}
  }

  const result = evaluateFinalGate();
  if (!result.ok) {
    attempts.count = (attempts.count || 0) + 1;
    attempts.updatedAt = new Date().toISOString();
    try {
      fs.mkdirSync(path.dirname(attemptsPath), { recursive: true });
      fs.writeFileSync(attemptsPath, JSON.stringify(attempts, null, 2));
    } catch {}

    if (attempts.count > 3) {
      attempts.count = 0;
      attempts.updatedAt = new Date().toISOString();
      try {
        fs.writeFileSync(attemptsPath, JSON.stringify(attempts, null, 2));
      } catch {}

      const reasonLines = result.reason.split("\n");
      const reasonSnippet = reasonLines.length > 3 ? reasonLines.slice(0, 3).join("\n") + "\n..." : result.reason;
      console.log(JSON.stringify({
        continue: true,
        systemMessage: `[Harness] 게이트 3회 연속 실패 — 차단 해제. 미해결:\n${reasonSnippet}`
      }));
      return;
    }

    console.log(JSON.stringify({ decision: "block", reason: result.reason }));
    return;
  }

  // Gate passed: reset attempts count
  attempts.count = 0;
  attempts.updatedAt = new Date().toISOString();
  try {
    fs.mkdirSync(path.dirname(attemptsPath), { recursive: true });
    fs.writeFileSync(attemptsPath, JSON.stringify(attempts, null, 2));
  } catch {}

  // Check reminder
  const archPaths = CFG.archTriggerPaths || ["src/pages/", "src/components/"];
  const minLines = CFG.qaTriggerMinLines !== undefined ? CFG.qaTriggerMinLines : 30;

  let totalLinesChanged = 0;
  try {
    // Check if git HEAD exists first (to avoid fatal error in fresh git repos without commits)
    const hasHead = execSync("git rev-parse --verify HEAD >/dev/null 2>&1 && echo yes || echo no", { cwd: ROOT, encoding: "utf8" }).trim() === "yes";
    if (hasHead && archPaths.length > 0) {
      const escapedPaths = archPaths.map(p => `"${p}"`).join(" ");
      // 1. Modified/deleted lines via diff numstat
      const stdout = execSync(`git diff HEAD --numstat -- ${escapedPaths}`, { cwd: ROOT, encoding: "utf8" });
      const lines = stdout.trim().split("\n");
      for (const line of lines) {
        if (line) {
          const parts = line.trim().split(/\s+/);
          const added = parseInt(parts[0], 10);
          const deleted = parseInt(parts[1], 10);
          if (!isNaN(added)) totalLinesChanged += added;
          if (!isNaN(deleted)) totalLinesChanged += deleted;
        }
      }
      // 2. Untracked lines in guarded paths
      const untrackedStdout = execSync(`git ls-files --others --exclude-standard -- ${escapedPaths}`, { cwd: ROOT, encoding: "utf8" });
      const untrackedFiles = untrackedStdout.trim().split("\n").filter(Boolean);
      for (const relFile of untrackedFiles) {
        const absFile = path.resolve(ROOT, relFile);
        try {
          const content = fs.readFileSync(absFile, "utf8");
          totalLinesChanged += content.split("\n").length;
        } catch {}
      }
    }
  } catch (e) {
    // Ignore git command errors
  }

  if (totalLinesChanged >= minLines) {
    console.log(JSON.stringify({
      continue: true,
      suppressOutput: true,
      systemMessage: `[Harness] 주요 경로 미커밋 변경 ${totalLinesChanged}줄 — 커밋 전 /code-review 권고`
    }));
  } else {
    console.log(JSON.stringify({ continue: true, suppressOutput: true }));
  }
});
