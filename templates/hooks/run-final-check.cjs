#!/usr/bin/env node
"use strict";

const { evaluateFinalGate } = require("./lib/final-gate.cjs");

const result = evaluateFinalGate();

if (result.ok) {
  if (result.skipped) {
    console.log(`[Harness] Final check skipped: ${result.reason}`);
  } else {
    console.log("[Harness] Final check passed.");
    if (result.verifiedPath) console.log(`[Harness] Verification artifact: ${result.verifiedPath}`);
  }
  process.exit(0);
}

console.error(result.reason);
process.exit(1);
