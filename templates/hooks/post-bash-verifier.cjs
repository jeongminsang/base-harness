#!/usr/bin/env node
"use strict";

let raw = "";
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => {
  let data = {};
  try {
    data = JSON.parse(raw || "{}");
  } catch {
    console.log(JSON.stringify({ continue: true }));
    return;
  }

  if (data.tool_name !== "Bash") {
    console.log(JSON.stringify({ continue: true }));
    return;
  }

  // tool_response는 문자열 또는 {stdout, stderr, ...} 객체로 올 수 있음
  const resp = data.tool_response;
  const output =
    typeof resp === "string"
      ? resp
      : resp && typeof resp === "object"
        ? [resp.stdout, resp.stderr, resp.output].filter(Boolean).join("\n")
        : String(data.output || "");

  // 빌드/타입체크/린트 실패 패턴 — 일반 단어("cannot", "failed" 단독)는
  // 파일 내용/grep 결과에 흔해 오탐을 유발하므로 강한 신호만 매칭
  const isFailed =
    /(^|\s)error(:|\s+TS)|✖|\bTS\d{4}\b|fatal:|command not found|permission denied|npm ERR!|ELIFECYCLE|(?:build|compilation|lint|type\s?-?check|tests?)\s+failed|exit code:? [1-9]/i.test(
      output
    );

  if (isFailed) {
    console.log(
      JSON.stringify({
        continue: true,
        hookSpecificOutput: {
          hookEventName: "PostToolUse",
          additionalContext:
            "[하네스 경고] 방금 실행한 명령이 실패했습니다. " +
            "에러 로그를 분석하고 원인을 수정한 뒤 재시도하세요. " +
            "'성공했다'고 판단하지 마세요.",
        },
      })
    );
    return;
  }

  console.log(JSON.stringify({ continue: true }));
});
