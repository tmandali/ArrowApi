/**
 * Node built-in test runner: npx tsx --test src/lib/report-analysis-topics.test.ts
 * x-ai.analysisTopics okuma + retail-sales playbook tohumu.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readReportAiMetadata } from "./report-ai-metadata.ts";

const here = dirname(fileURLToPath(import.meta.url));
const retailSchema = JSON.parse(
  readFileSync(
    join(
      here,
      "..",
      "workspaces",
      "stock",
      "retail-sales-report",
      "schemas",
      "retail-sales-criteria.schema.json",
    ),
    "utf-8",
  ),
);

describe("readReportAiMetadata.analysisTopics", () => {
  it("parses the retail-sales playbook", () => {
    const topics = readReportAiMetadata(retailSchema).analysisTopics;
    assert.ok(topics && topics.length >= 5);
    assert.equal(topics[0].id, "ciro-kdv-ozeti");
    assert.deepEqual(topics[0].columns, ["Tutar", "Kdv"]);
  });

  it("drops malformed entries", () => {
    const topics = readReportAiMetadata({
      "x-ai": {
        analysisTopics: [
          { id: "ok", title: "Ok", goal: "g", tool: "analyze" },
          { id: "bad-tool", title: "Bad", goal: "g", tool: "teleport" },
          { title: "missing-id", goal: "g", tool: "sql" },
        ],
      },
    }).analysisTopics;
    assert.deepEqual((topics ?? []).map((t) => t.id), ["ok"]);
  });

  it("returns undefined without analysisTopics", () => {
    assert.equal(readReportAiMetadata({}).analysisTopics, undefined);
  });
});
