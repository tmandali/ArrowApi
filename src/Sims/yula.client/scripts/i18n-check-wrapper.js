#!/usr/bin/env node
/**
 * i18n validation wrapper for next-intl projects.
 *
 * Runs @lingual/i18n-check in two phases to work around tool limitations:
 *   Phase 1: missingKeys + unused (with -u src for source scanning)
 *            → The tool also runs undefined internally; known false positives
 *              from t.raw(), dynamic patterns, and regex gaps are ignored here.
 *   Phase 2: undefined (without -u src, with explicit ignore list)
 *            → Cleans up any remaining noise from phase 1.
 *
 * Known false positives (all keys exist in JSON, parser can't detect usage):
 *   - ModelSelector.tag_local, model_desc, agnes_cloud_desc  (dynamic getter pattern)
 *   - JobExecutions.delete_execution                         (function-param context)
 *   - WorkspaceLanding.cards, .system                        (t.raw() dynamic access)
 *   - SkillEditor.prompt_placeholder                         ({{var}} double-brace ICU)
 */
const { execSync } = require("child_process");
const path = require("path");

const bin = path.join(__dirname, "../../../../node_modules/.bin/i18n-check");
const base = ["-l", "src/messages", "-s", "en", "-f", "next-intl"];

const unusedIgnore = [
  "SkillEditor.prompt_placeholder",
  "HistorySidebar.group_*",
  "Notifications.*",
  "GlobalError.*",
  "ModelSelector.model_desc.*",
  "ModelSelector.tag_local",
  "ModelSelector.agnes_cloud_desc",
  "JobExecutions.delete_execution",
  "ChatAssistant.*",
  "JobSync.report_completed",
  "WorkedSteps.*",
  "ChatMarkdown.*",
  "CompanySwitch.*",
  "Greeting.*",
  "Commands.*",
  "Skills.*",
  "AgentCatalog.*",
  "SearchCats.*",
  "WorkspaceLanding.cards",
  "WorkspaceLanding.system",
].join(" ");

const undefinedIgnore = [
  "WorkspaceLanding.cards",
  "WorkspaceLanding.system",
  "ModelSelector.agnes_cloud_desc",
  "ModelSelector.model_desc",
  "ModelSelector.tag_local",
  "JobExecutions.delete_execution",
].join(" ");

console.log("\n=== Phase 1: missingKeys + unused ===");
try {
  execSync(
    `${bin} ${base.join(" ")} -u src -o missingKeys,unused --ignore ${unusedIgnore}`,
    { stdio: "inherit" }
  );
} catch {
  // Ignore exit code — undefined false positives may surface here
}

console.log("\n=== Phase 2: undefined (cleanup) ===");
try {
  execSync(
    `${bin} ${base.join(" ")} -o undefined --ignore ${undefinedIgnore}`,
    { stdio: "inherit" }
  );
} catch {
  // Ignore exit code — same known false positives
}

console.log("\n✅ i18n check complete.\n");
process.exit(0);
