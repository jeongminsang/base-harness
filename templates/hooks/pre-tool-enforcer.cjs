#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { checkL3, checkL2, ROOT } = require("./lib/l3-rules.cjs");

let raw = "";
process.stdin.on("data", (chunk) => (raw += chunk));
process.stdin.on("end", () => {
  let payload;
  try {
    payload = JSON.parse(raw || "{}");
  } catch {
    allow();
    return;
  }

  const toolName = payload.tool_name || "";
  const input = payload.tool_input || {};
  const filePath = input.file_path || "";
  const content = input.content || input.new_string || "";

  if (!["Write", "Edit"].includes(toolName) || !isSrcFile(filePath)) {
    allow();
    return;
  }

  // Write 시점에 파일이 없으면 신규 파일
  const absPath = path.isAbsolute(filePath) ? filePath : path.join(ROOT, filePath);
  const isNewFile = !fs.existsSync(absPath);

  const violations = checkL3(filePath, content, { isNewFile });
  const warnings = checkL2(filePath, content);

  if (violations.length > 0) {
    deny(violations, warnings);
  } else {
    const ctxLines = warnings.map((w) => `⚠️  [${w.skill}] ${w.detail}`);
    allow(ctxLines.length > 0 ? ctxLines.join("\n") : null);
  }
});

function isSrcFile(p) {
  return p.includes("src/") && /\.(tsx?|jsx?)$/.test(p);
}

function deny(violations, warnings) {
  const lines = violations.map((v) => `❌ [${v.skill}]\n     ${v.detail}`);
  if (warnings.length > 0) {
    lines.push("");
    lines.push(...warnings.map((w) => `⚠️  [${w.skill}]\n     ${w.detail}`));
  }
  const reason =
    `🚫 L3 하네스 위반 — 파일 쓰기 차단\n\n` +
    lines.join("\n") +
    `\n\n위반 사항을 수정한 후 재시도하세요.`;

  process.stderr.write(reason + "\n");
  console.log(JSON.stringify({
    continue: true,
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: reason,
    },
  }));
}

function allow(contextMsg) {
  const out = {
    continue: true,
    hookSpecificOutput: { hookEventName: "PreToolUse" },
  };
  if (contextMsg) out.hookSpecificOutput.additionalContext = contextMsg;
  console.log(JSON.stringify(out));
}
