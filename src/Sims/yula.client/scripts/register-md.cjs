/**
 * Node test runner preload (`tsx --require ./scripts/register-md.cjs`):
 * `lib/built-in-skills.ts` is BUNDLER-ONLY and raw-imports skills/*.md
 * files. Under tsx/CJS the .md files would be compiled as JavaScript and
 * crash, so register a require extension that yields the raw text as a
 * string default export — mirroring the bundler's `?raw` behavior.
 */
const fs = require("node:fs");

require.extensions[".md"] = (module, filename) => {
  module.exports = fs.readFileSync(filename, "utf-8");
};

require.extensions[".yaml"] = (module, filename) => {
  module.exports = fs.readFileSync(filename, "utf-8");
};

require.extensions[".yml"] = (module, filename) => {
  module.exports = fs.readFileSync(filename, "utf-8");
};

require.extensions[".css"] = (module) => {
  module.exports = {};
};

// Node test runner shim for pure-ESM streamdown package under tsx/CJS
const path = require("node:path");
const Module = require("node:module");
const originalResolveFilename = Module._resolveFilename;
const shimPath = path.resolve(__dirname, "streamdown-shim.cjs");

Module._resolveFilename = function (request, parent, isMain, options) {
  if (request === "streamdown") {
    return shimPath;
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

