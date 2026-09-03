#!/usr/bin/env node
/**
 * List Yula slash commands from *.agent.yaml manifests.
 * Usage (repo root): node .cursor/skills/yula-ai/scripts/list-agents.mjs
 *        [--phase system|grid|report]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../../..");
const yulaRoot = path.join(repoRoot, "src/Sims/yula.client");

const MANIFESTS = {
  system: "src/features/system/agents/system.agent.yaml",
  grid: "src/features/reports/agents/grid.agent.yaml",
  report: "src/features/stock/agents/report.agent.yaml",
};

function loadYaml(filePath) {
  const require = createRequire(path.join(yulaRoot, "package.json"));
  const { load } = require("js-yaml");
  return load(fs.readFileSync(filePath, "utf8"));
}

const phaseFilter = (() => {
  const i = process.argv.indexOf("--phase");
  return i >= 0 ? process.argv[i + 1] : null;
})();

const rows = [];
for (const [phase, rel] of Object.entries(MANIFESTS)) {
  if (phaseFilter && phaseFilter !== phase) continue;
  const abs = path.join(yulaRoot, rel);
  if (!fs.existsSync(abs)) {
    console.error(`Missing: ${rel}`);
    continue;
  }
  const doc = loadYaml(abs);
  for (const cmd of doc?.commands ?? []) {
    rows.push({
      phase: cmd.phase ?? phase,
      slash: `/${cmd.slash}`,
      id: cmd.id,
      label: cmd.label,
      icon: cmd.icon,
      file: rel,
    });
  }
}

if (rows.length === 0) {
  console.log("No commands found.");
  process.exit(0);
}

const w = {
  phase: Math.max(5, ...rows.map((r) => r.phase.length)),
  slash: Math.max(5, ...rows.map((r) => r.slash.length)),
  id: Math.max(2, ...rows.map((r) => r.id.length)),
  label: Math.max(5, ...rows.map((r) => String(r.label).length)),
};

console.log(
  `${"PHASE".padEnd(w.phase)}  ${"SLASH".padEnd(w.slash)}  ${"ID".padEnd(w.id)}  ${"LABEL".padEnd(w.label)}  ICON`,
);
for (const r of rows) {
  console.log(
    `${r.phase.padEnd(w.phase)}  ${r.slash.padEnd(w.slash)}  ${r.id.padEnd(w.id)}  ${String(r.label).padEnd(w.label)}  ${r.icon}`,
  );
}
console.log(`\n${rows.length} command(s).`);
