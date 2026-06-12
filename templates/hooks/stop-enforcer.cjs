#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const { evaluateFinalGate, loadConfig } = require("./lib/final-gate.cjs");
const { ROOT } = require("./lib/l3-rules.cjs");

// Non-blocking review reminder: significant uncommitted changes in major paths
// should get a fresh-context review (/code-review) before being committed.
function reviewReminder() {
  const cfg = loadConfig();
  const archPaths = cfg.archTriggerPaths || ["src/pages/", "src/components/"];
  const minLines = cfg.qaTriggerMinLines || 30;
  try {
    const stat = execSync(`git diff HEAD --numstat -- ${archPaths.join(" ")}`, {
      cwd: ROOT,
      encoding: "utf8",
      timeout: 5000,
    });
    let changed = 0;
    for (const line of stat.split("\n")) {
      const m = line.match(/^(\d+)\t(\d+)\t/);
      if (m) changed += Number(m[1]) + Number(m[2]);
    }
    if (changed >= minLines) {
      return `[Harness] 주요 경로(${archPaths.join(", ")})에 미커밋 변경 ${changed}줄 — 커밋 전 /code-review 실행을 권고합니다.`;
    }
  } catch {}
  return null;
}

// Bounded blocking: a Stop hook that blocks unconditionally loops forever when
// the gate is unsatisfiable. stop_hook_active marks stops caused by this hook;
// after MAX_BLOCKS consecutive blocks we let the stop through with a warning.
const ATTEMPTS_PATH = path.join(ROOT, ".omc/state/stop-gate-attempts.json");
const MAX_BLOCKS = 3;

function readAttempts() {
  try {
    return JSON.parse(fs.readFileSync(ATTEMPTS_PATH, "utf8")).count || 0;
  } catch {
    return 0;
  }
}

function writeAttempts(count) {
  try {
    fs.mkdirSync(path.dirname(ATTEMPTS_PATH), { recursive: true });
    fs.writeFileSync(
      ATTEMPTS_PATH,
      JSON.stringify({ count, updatedAt: new Date().toISOString() })
    );
  } catch {}
}

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

  // Involuntary or user-initiated stops must never be gated: blocking a
  // context-limit stop just burns the remaining window, and blocking a user
  // cancel overrides an explicit human decision.
  const stopReason = (data.stop_reason || "").toLowerCase();
  if (stopReason.includes("context_limit") || stopReason.includes("max_tokens")) {
    console.log(JSON.stringify({ continue: true, suppressOutput: true }));
    return;
  }
  if (data.user_requested || stopReason.includes("user_cancel")) {
    console.log(JSON.stringify({ continue: true, suppressOutput: true }));
    return;
  }

  const result = evaluateFinalGate();
  if (result.ok) {
    writeAttempts(0);
    const reminder = reviewReminder();
    const out = { continue: true, suppressOutput: true };
    if (reminder) out.systemMessage = reminder;
    console.log(JSON.stringify(out));
    return;
  }

  const attempts = data.stop_hook_active ? readAttempts() : 0;
  if (attempts >= MAX_BLOCKS) {
    writeAttempts(0);
    process.stderr.write(
      `[Harness] Gate still failing after ${MAX_BLOCKS} blocks; allowing stop to avoid an infinite loop.\nLast reason:\n${result.reason}\n`
    );
    console.log(JSON.stringify({ continue: true }));
    return;
  }

  writeAttempts(attempts + 1);
  console.log(JSON.stringify({ decision: "block", reason: result.reason }));
});
