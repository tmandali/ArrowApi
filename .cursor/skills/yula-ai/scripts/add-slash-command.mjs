#!/usr/bin/env node
/**
 * Append a slash command to an existing Yula *.agent.yaml (no TS code change).
 *
 * Usage (repo root):
 *   node .cursor/skills/yula-ai/scripts/add-slash-command.mjs \
 *     --phase grid --slash kpi --label "KPI" \
 *     --prompt "Genel toplam ve KPI göster" --icon BarChart2
 *
 * Options:
 *   --phase system|grid|report   (required)
 *   --slash <token>              without leading /
 *   --label <text>
 *   --description <text>         optional (defaults to label)
 *   --prompt <text>              optional (defaults to label)
 *   --icon <LucideName>          must exist in ICON_MAP unless --force-icon
 *   --id <id>                    optional (defaults to <phase>-<slash>)
 *   --pagePath <path>            optional
 *   --dry-run
 *   --force-icon                 allow icon not in ICON_MAP
 *   --help
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

const KNOWN_ICONS = new Set([
  "SquarePen",
  "Paperclip",
  "FileText",
  "BarChart2",
  "Database",
  "RotateCcw",
  "Package",
  "ShieldAlert",
]);

function usage() {
  console.log(`Usage:
  node .cursor/skills/yula-ai/scripts/add-slash-command.mjs --phase <system|grid|report> --slash <token> --label <text> [--prompt <text>] [--icon BarChart2]

Phases map to:
  system → ${MANIFESTS.system}
  grid   → ${MANIFESTS.grid}
  report → ${MANIFESTS.report}

Known icons: ${[...KNOWN_ICONS].join(", ")}`);
}

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0) return undefined;
  return process.argv[i + 1];
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function yamlEscape(s) {
  if (/[:#{}[\],&*?|>!%@`"'\\]/.test(s) || /^\s|\s$/.test(s)) {
    return JSON.stringify(s);
  }
  return s;
}

if (hasFlag("help") || hasFlag("h")) {
  usage();
  process.exit(0);
}

const phase = arg("phase");
const slash = (arg("slash") || "").replace(/^\//, "");
const label = arg("label");
const description = arg("description") || label;
const prompt = arg("prompt") || label;
const icon = arg("icon") || "FileText";
const id = arg("id") || (phase && slash ? `${phase}-${slash}` : undefined);
const pagePath = arg("pagePath");
const dryRun = hasFlag("dry-run");
const forceIcon = hasFlag("force-icon");

if (!phase || !MANIFESTS[phase] || !slash || !label) {
  usage();
  process.exit(1);
}

if (!KNOWN_ICONS.has(icon) && !forceIcon) {
  console.error(
    `Unknown icon "${icon}". Use one of: ${[...KNOWN_ICONS].join(", ")} (or --force-icon and add ICON_MAP in yula-commands.ts).`,
  );
  process.exit(1);
}

const rel = MANIFESTS[phase];
const abs = path.join(yulaRoot, rel);
const require = createRequire(path.join(yulaRoot, "package.json"));
const { load, dump } = require("js-yaml");

const doc = load(fs.readFileSync(abs, "utf8")) || { commands: [] };
if (!Array.isArray(doc.commands)) doc.commands = [];

if (doc.commands.some((c) => c.slash === slash || c.id === id)) {
  console.error(`Conflict: slash "/${slash}" or id "${id}" already exists in ${rel}`);
  process.exit(1);
}

const entry = {
  id,
  slash,
  label,
  description,
  prompt,
  icon,
  phase,
};
if (pagePath) entry.pagePath = pagePath;

doc.commands.push(entry);

const out = dump(doc, {
  lineWidth: 100,
  quotingType: '"',
  forceQuotes: false,
});

if (dryRun) {
  console.log(`--- dry-run ${rel} ---`);
  console.log(out);
  process.exit(0);
}

fs.writeFileSync(abs, out.endsWith("\n") ? out : `${out}\n`, "utf8");
console.log(`Added /${slash} → ${rel}`);
console.log(`  id=${id} icon=${icon}`);
console.log(`  prompt=${yamlEscape(prompt)}`);
console.log("No TypeScript change required. Hard-refresh the app and type / in Yula chat.");
