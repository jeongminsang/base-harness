#!/usr/bin/env node
"use strict";

// SessionStart hook: snapshot the files already dirty when the session begins,
// so the stop gate only enforces changes this session actually made — a repo
// with pre-existing user WIP must not block the model's stops.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { loadConfig, getChangedFiles, srcDirsOf } = require("./lib/final-gate.cjs");
const { ROOT } = require("./lib/l3-rules.cjs");

let sessionId = null;
try {
  const raw = fs.readFileSync(0, "utf8");
  sessionId = JSON.parse(raw || "{}").session_id || null;
} catch {}
if (!sessionId) process.exit(0);

const STATE = path.join(ROOT, ".omc", "state", "session-baseline.json");
let state = { sessions: {} };
try { state = JSON.parse(fs.readFileSync(STATE, "utf8")); } catch {}
if (!state.sessions) state = { sessions: {} };

// Resume re-fires SessionStart with the same session id — keep the original
// snapshot, otherwise the session's own earlier edits would escape the gate.
if (!state.sessions[sessionId]) {
  const files = {};
  try {
    const changed = getChangedFiles(srcDirsOf(loadConfig()));
    for (const f of changed.allChanged) {
      try {
        files[f] = crypto.createHash("sha1").update(fs.readFileSync(path.join(ROOT, f))).digest("hex");
      } catch {}
    }
  } catch {}
  state.sessions[sessionId] = { files, updatedAt: Date.now() };
  // 최근 5개 세션만 유지 (파일 무한 성장 방지)
  const keep = Object.keys(state.sessions)
    .sort((a, b) => (state.sessions[b].updatedAt || 0) - (state.sessions[a].updatedAt || 0))
    .slice(0, 5);
  state.sessions = Object.fromEntries(keep.map((id) => [id, state.sessions[id]]));
  try {
    fs.mkdirSync(path.dirname(STATE), { recursive: true });
    fs.writeFileSync(STATE, JSON.stringify(state));
  } catch {}
}
process.exit(0);
