#!/usr/bin/env node
"use strict";

const { evaluateFinalGate } = require("./lib/final-gate.cjs");

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

  const result = evaluateFinalGate();
  if (!result.ok) {
    console.log(JSON.stringify({ decision: "block", reason: result.reason }));
    return;
  }
  console.log(JSON.stringify({ continue: true, suppressOutput: true }));
});
