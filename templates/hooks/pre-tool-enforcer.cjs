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
    // Fail-open by design (final gate still applies) — but never silently.
    process.stderr.write("[pre-tool-enforcer] stdin parse failed — allowing (fail-open)\n");
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
  // srcDir은 preset마다 다르므로(config.json) 하드코딩하지 않는다.
  // 문자열 또는 배열(예: Next.js의 app/ + src/) 모두 허용.
  let raw = "src/";
  try {
    raw = JSON.parse(fs.readFileSync(path.join(__dirname, "config.json"), "utf8")).srcDir || "src/";
  } catch {}
  const srcDirs = (Array.isArray(raw) ? raw : [raw])
    .filter(Boolean)
    .map((d) => (d.endsWith("/") ? d : `${d}/`));
  if (!/\.(tsx?|jsx?)$/.test(p)) return false;
  // ROOT와 p의 symlink 표기가 어긋날 수 있어(macOS /tmp 등) 양쪽 다 realpath로 정규화.
  let realRoot = ROOT;
  try { realRoot = fs.realpathSync(ROOT); } catch {}
  let abs = path.resolve(realRoot, p);
  try { abs = path.join(fs.realpathSync(path.dirname(abs)), path.basename(abs)); } catch {}
  const rel = path.relative(realRoot, abs);
  return !rel.startsWith("..") && srcDirs.some((d) => rel.startsWith(d));
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
