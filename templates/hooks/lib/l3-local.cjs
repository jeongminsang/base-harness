"use strict";

// l3-local.cjs — project-owned rules. bootstrap.sh installs this file once and
// NEVER overwrites it, unlike l3-preset.cjs which is refreshed on every update.
// The L3 promotion ladder ends here: a violation observed repeatedly AND
// detectable by regex gets added to checkL3 below.
//
// checkL3/checkL2 receive (filePath, content, opts):
//   opts.clean     — content with comments stripped (string-aware); match on
//                    this to avoid flagging commented-out code.
//   opts.isNewFile — true when the Write targets a file that does not exist.
//
// Return [{ skill: "<id> (L3)", detail: "<actionable message>" }, ...].

function checkL3(_filePath, _content, _opts) {
  return [];
}

function checkL2(_filePath, _content, _opts) {
  return [];
}

module.exports = { checkL3, checkL2 };
