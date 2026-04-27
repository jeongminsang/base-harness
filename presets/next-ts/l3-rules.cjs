"use strict";

// next-ts preset — Next.js App Router + TypeScript rules

const path = require("path");
const fs = require("fs");

const ROOT = (() => {
  const candidate = path.resolve(__dirname, "../..");
  if (fs.existsSync(path.join(candidate, "hooks", "config.json"))) return candidate;
  return path.resolve(__dirname, "../../..");
})();

function stripComments(code) {
  return code
    .replace(/\/\/.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");
}

function checkL3(filePath, content, _opts) {
  const violations = [];
  const clean = stripComments(content);

  // [L3] No direct fetch in client components — use server actions or route handlers
  const isClientComponent = /['"]use client['"]/.test(content);
  const isRouteHandler = /route\.(ts|js)$/.test(filePath);
  const isServerAction = /['"]use server['"]/.test(content);

  if (isClientComponent && !isRouteHandler && /(?<!\w)fetch\s*\(/.test(clean)) {
    violations.push({
      skill: "next-fetch (L3)",
      detail:
        "Direct fetch() in a client component. " +
        "Use a Server Action ('use server') or Route Handler (app/api/) instead.",
    });
  }

  // [L3] No direct env access in client components
  if (isClientComponent && /process\.env\.(?!NEXT_PUBLIC_)/.test(clean)) {
    violations.push({
      skill: "next-env (L3)",
      detail:
        "Non-public env var accessed in client component. " +
        "Only NEXT_PUBLIC_* vars are safe on the client. Move logic to a Server Component.",
    });
  }

  // [L3] No console in production API handlers
  if (isRouteHandler && !isServerAction && /console\.(log|error|warn)/.test(clean)) {
    violations.push({
      skill: "next-api-logging (L3)",
      detail:
        "console.log/error/warn in Route Handler. Use structured logging (pino, winston) instead.",
    });
  }

  return violations;
}

function checkL2(filePath, content) {
  const warnings = [];
  const clean = stripComments(content);
  if (/HARNESS-BYPASS/.test(content)) return warnings;

  // [L2] Prefer Server Components — flag large client component files
  const isClientComponent = /['"]use client['"]/.test(content);
  if (isClientComponent) {
    const lines = clean.split("\n").length;
    if (lines > 150) {
      warnings.push({
        skill: "next-server-component (L2)",
        detail: `Large client component (${lines} lines). Consider splitting into Server + Client components.`,
      });
    }
  }

  return warnings;
}

module.exports = { checkL3, checkL2 };
