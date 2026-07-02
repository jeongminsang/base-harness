"use strict";

const path = require("path");
const fs = require("fs");

const ROOT = (() => {
  const candidate = path.resolve(__dirname, "../..");
  if (fs.existsSync(path.join(candidate, "hooks", "config.json"))) return candidate;
  return path.resolve(__dirname, "../../..");
})();

// Fallback only — hooks/lib/l3-rules.cjs strips once and passes opts.clean.
// Must stay string-aware: '//' inside a string literal (e.g. a URL) is not a
// comment; naive stripping hid the rest of the line from every rule.
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
      else if (c === "\n") out += c;
      continue;
    }
    if (c === "\\") { out += c + (d == null ? "" : d); i++; continue; }
    if (
      (mode === "single" && c === "'") ||
      (mode === "double" && c === '"') ||
      (mode === "template" && c === "`")
    ) {
      mode = "code";
    } else if (c === "\n" && mode !== "template") {
      mode = "code";
    }
    out += c;
  }
  return out;
}

function checkL3(filePath, content, opts = {}) {
  const violations = [];
  const clean = opts.clean != null ? opts.clean : stripComments(content);

  let CFG = {};
  try { CFG = JSON.parse(fs.readFileSync(path.join(ROOT, "hooks/config.json"), "utf8")); } catch {}
  const srcDir = CFG.srcDir || "src/";
  const isHttpUtil = /ut(il|ill)s\/http\./.test(filePath);
  const isTestFile = /\.(test|spec)\.(tsx?|jsx?)$/.test(filePath);

  if (!isHttpUtil && !isTestFile && /\baxios\s*\.|(?<!\w)fetch\s*\(/.test(clean)) {
    violations.push({
      skill: "api-error-handling (L3)",
      detail: "Direct axios/fetch call detected. Use the project http wrapper instead.",
    });
  }

  // [L3] api-error-handling — console in onError handlers
  if (
    /onError\s*:\s*(?:\([^)]*\)\s*=>|function[^{]*\{)[^}]{0,120}console\.(error|log|warn)/.test(clean) ||
    /onError\s*:\s*\([^)]*\)\s*=>\s*console\.(error|log|warn)/.test(clean)
  ) {
    violations.push({
      skill: "api-error-handling (L3)",
      detail: "console.error/log/warn in onError handler. Expose errors to the user instead.",
    });
  }

  // [L3] rhf-zod — page forms without RHF
  const isPage = filePath.includes(`${srcDir}pages/`) && filePath.endsWith(".tsx");
  const isValidation = filePath.includes(`${srcDir}validation/`);
  if (isPage && !isValidation) {
    const hasState = /\buseState\b/.test(clean);
    const hasUseForm = /\buseForm\b/.test(clean);
    const hasDisabledLogic = /\bisDisabled\b|disabled=\{/.test(clean);
    const hasBypass = /HARNESS-BYPASS/.test(content);
    if (hasState && hasDisabledLogic && !hasUseForm && !hasBypass) {
      violations.push({
        skill: "rhf-zod (L3)",
        detail:
          "Form disabled logic with custom state but no useForm. " +
          "Use RHF useForm + zodResolver. Add `// HARNESS-BYPASS: <reason>` if unavoidable.",
      });
    }
  }

  // [L3] prohibited-utilities — blocked Tailwind classes
  if (/font-\[pretendard\]|(?<![a-z])leading-3\b|(?<![a-z])leading-4\b/.test(content)) {
    violations.push({
      skill: "prohibited-utilities (L3)",
      detail: "Blocked Tailwind utilities detected: font-[pretendard], leading-3, leading-4.",
    });
  }

  return violations;
}

function checkL2(filePath, content, opts = {}) {
  const warnings = [];
  const clean = opts.clean != null ? opts.clean : stripComments(content);
  if (/HARNESS-BYPASS/.test(content)) return warnings;

  // [L2] custom-hook-extraction
  if (filePath.endsWith(".tsx")) {
    const stateCount = (clean.match(/\buseState\b/g) || []).length;
    const mutationCount = (clean.match(/\buseMutation\b/g) || []).length;
    const effectCount = (clean.match(/\buseEffect\b/g) || []).length;
    if (stateCount >= 2 && (mutationCount >= 1 || effectCount >= 1)) {
      warnings.push({
        skill: "custom-hook-extraction (L2)",
        detail: `useState×${stateCount} + mutation/effect inline. Extract to a custom hook.`,
      });
    }
  }

  return warnings;
}

module.exports = { checkL3, checkL2 };
