"use strict";

// vanilla-ts preset — no stack-specific rules
// Core rules (no-any-type, ARCH-TRIGGER) are handled by hooks/lib/l3-rules.cjs

function checkL3(_filePath, _content, _opts) {
  return [];
}

function checkL2(_filePath, _content) {
  return [];
}

module.exports = { checkL3, checkL2 };
