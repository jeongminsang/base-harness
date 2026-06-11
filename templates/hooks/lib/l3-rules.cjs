"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = (() => {
  const candidate = path.resolve(__dirname, "../..");
  return path.basename(candidate) === "templates" ? path.dirname(candidate) : candidate;
})();

// Load config
let CFG = {};
try { CFG = JSON.parse(fs.readFileSync(path.join(__dirname, "../config.json"), "utf8")); } catch {}

// Load preset plugin
const preset = (() => {
  const local = path.join(__dirname, "l3-preset.cjs");
  if (fs.existsSync(local)) return require(local);
  const presetId = CFG.preset || "vanilla-ts";
  const harnessPath = path.join(ROOT, "presets", presetId, "l3-rules.cjs");
  if (fs.existsSync(harnessPath)) return require(harnessPath);
  return { checkL3: () => [], checkL2: () => [] };
})();

function stripComments(code) {
  return code
    .replace(/\/\/.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");
}

function checkL3Core(filePath, content, { isNewFile = false } = {}) {
  const violations = [];
  const clean = stripComments(content);

  // [L3] no-any-type — universal
  if (/:\s*any\b|as\s+any\b|<any>|Record<string,\s*any>/.test(clean)) {
    violations.push({
      skill: "no-any-type (L3)",
      detail: "`any` type detected. Use `unknown` or an explicit type.",
    });
  }

  return violations;
}

function checkL3(filePath, content, opts) {
  return [
    ...checkL3Core(filePath, content, opts),
    ...preset.checkL3(filePath, content, opts),
  ];
}

function checkL2(filePath, content) {
  return preset.checkL2(filePath, content);
}

module.exports = { checkL3, checkL2, stripComments, ROOT };
