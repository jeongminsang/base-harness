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

  const output = data.tool_response || data.output || "";

  // 빌드/타입체크/린트 실패 패턴
  const isFailed =
    /error:|failed|cannot|permission denied|fatal:|tsc:|✖|TS\d{4}|exit code: [1-9]/i.test(
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
