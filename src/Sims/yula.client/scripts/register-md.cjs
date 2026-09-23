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
