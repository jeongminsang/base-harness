#!/usr/bin/env node
"use strict";

const { evaluateFinalGate } = require("./lib/final-gate.cjs");

// --staged: validate index content (pre-commit path) instead of the working tree.
const result = evaluateFinalGate({ staged: process.argv.includes("--staged") });

if (result.ok) {
  if (result.skipped) {
    console.log(`[Harness] Final check skipped: ${result.reason}`);
  } else {
    console.log("[Harness] Final check passed.");
  }
  process.exit(0);
}

console.error(result.reason);
process.exit(1);
