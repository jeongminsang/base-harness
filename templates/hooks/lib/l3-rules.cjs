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

// Project-owned rules. bootstrap.sh never overwrites l3-local.cjs, so the L3
// promotion ladder lands here — l3-preset.cjs is refreshed on every update.
const localRules = (() => {
  const p = path.join(__dirname, "l3-local.cjs");
  if (fs.existsSync(p)) {
    try { return require(p); } catch {}
  }
  return { checkL3: () => [], checkL2: () => [] };
})();

// String-aware comment stripping. '//' inside a string literal (e.g. a URL)
// is not a comment — naive line stripping hid everything after it on the same
// line from every rule. String contents are preserved because rules (e.g. the
// next-ts fetch allowlist) match on them.
function stripComments(code) {
  let out = "";
  let mode = "code"; // code | line | block | single | double | template
  for (let i = 0; i < code.length; i++) {
    const c = code[i];
    const d = code[i + 1];
    if (mode === "code") {
      if (c === "/" && d === "/") { mode = "line"; i++; continue; }
      if (c === "/" && d === "*") { mode = "block"; i++; continue; }
      if (c === "'") mode = "single";
      else if (c === '"') mode = "double";
      else if (c === "`") mode = "template";
      out += c;
      continue;
    }
    if (mode === "line") {
      if (c === "\n") { mode = "code"; out += c; }
      continue;
    }
    if (mode === "block") {
      if (c === "*" && d === "/") { mode = "code"; i++; }
      else if (c === "\n") out += c; // keep line count stable
      continue;
    }
    // inside a string literal
    if (c === "\\") { out += c + (d == null ? "" : d); i++; continue; }
    if (
      (mode === "single" && c === "'") ||
      (mode === "double" && c === '"') ||
      (mode === "template" && c === "`")
    ) {
      mode = "code";
    } else if (c === "\n" && mode !== "template") {
      mode = "code"; // unterminated string — recover
    }
    out += c;
  }
  return out;
}

function checkL3Core(filePath, content, opts = {}) {
  const violations = [];
  const clean = opts.clean != null ? opts.clean : stripComments(content);

  // [L3] no-any-type — universal. Covers `: any`, `as any`, `any[]`, and
  // generic positions (`<any>`, `<any, …`, `…, any>`); tsc strict is not a
  // backstop here since `any` is not a type error.
  if (/:\s*any\b|as\s+any\b|<\s*any\s*[,>]|,\s*any\s*>|\bany\[\]/.test(clean)) {
    violations.push({
      skill: "no-any-type (L3)",
      detail: "`any` type detected. Use `unknown` or an explicit type.",
    });
  }

  return violations;
}

function checkL3(filePath, content, opts) {
  // Strip once, share via opts.clean so preset/local rules don't re-implement it.
  const shared = { ...(opts || {}), clean: stripComments(content) };
  return [
    ...checkL3Core(filePath, content, shared),
    ...(typeof preset.checkL3 === "function" ? preset.checkL3(filePath, content, shared) : []),
    ...(typeof localRules.checkL3 === "function" ? localRules.checkL3(filePath, content, shared) : []),
  ];
}

function checkL2(filePath, content) {
  const shared = { clean: stripComments(content) };
  return [
    ...(typeof preset.checkL2 === "function" ? preset.checkL2(filePath, content, shared) : []),
    ...(typeof localRules.checkL2 === "function" ? localRules.checkL2(filePath, content, shared) : []),
  ];
}

module.exports = { checkL3, checkL2, stripComments, ROOT };
