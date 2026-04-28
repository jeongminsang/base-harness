#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { loadConfig } = require("./lib/final-gate.cjs");
const { ROOT } = require("./lib/l3-rules.cjs");

const cfg = loadConfig();
const target = path.join(ROOT, cfg.verifiedCompletePath || "../state/verified-complete.json");
const verifiedFiles = process.argv.slice(2);

if (verifiedFiles.length === 0) {
  console.error("Usage: node hooks/write-verified-complete.cjs <file> [file...]");
  process.exit(1);
}

fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(
  target,
  JSON.stringify(
    {
      verifiedAt: new Date().toISOString(),
      verifiedFiles,
      verifier: process.env.HARNESS_VERIFIER || "manual",
    },
    null,
    2
  ) + "\n"
);

console.log(`[Harness] Wrote ${path.relative(ROOT, target)}`);
