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
// Priority: hooks/lib/l3-preset.cjs (bootstrap copies selected preset here)
//           harness/presets/<id>/l3-rules.cjs (source repo)
//           fallback: no-op stubs
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

  // [L3] ARCH-TRIGGER — config-driven paths
  if (isNewFile) {
    const archPaths = CFG.archTriggerPaths || ["src/pages/", "src/components/"];
    const absPath = path.isAbsolute(filePath) ? filePath : path.join(ROOT, filePath);
    const isArchFile = archPaths.some((p) =>
      absPath.replace(/\\/g, "/").includes(p)
    );

    if (isArchFile) {
      const debatePath = path.join(ROOT, CFG.debateLedger || "memory/debate/rounds.json");
      let hasConsensus = false;

      if (!fs.existsSync(debatePath)) {
        hasConsensus = true; // Skip check if ledger is missing
      } else {
        try {
          const { rounds } = JSON.parse(fs.readFileSync(debatePath, "utf8"));
          const basename = path.basename(filePath, path.extname(filePath)).toLowerCase();
          hasConsensus = (rounds || []).some(
            (r) =>
              r.state === "CONSENSUS" &&
              (r.task || "").toLowerCase().includes(basename) &&
              Array.isArray(r.challenges) &&
              r.challenges.length >= 3
          );
        } catch {}
      }

      if (!hasConsensus) {
        violations.push({
          skill: "ARCH-TRIGGER (L3)",
          detail:
            `New file detected in guarded path: ${path.basename(filePath)}. ` +
            `Add a CONSENSUS entry (challenges.length >= 3) to memory/debate/rounds.json first. ` +
            `Sparse challenges array means critic Agent was not invoked.`,
        });
      }
    }
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
