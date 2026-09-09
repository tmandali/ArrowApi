/**
 * Node built-in test runner: npx tsx --test src/lib/yula-source-table.test.ts
 * Analiz kaynak tablosu çıkarımı (saf).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extractSourceTable } from "./yula-source-table.ts";
import type { YulaToolPartInfo } from "@/lib/yula-tool-info";

function sqlPart(sql: string): YulaToolPartInfo {
  return {
    toolName: "run_expert_sql",
    state: "output-available",
    toolCallId: "c1",
    input: { sql },
  };
}

describe("extractSourceTable", () => {
  it("returns the concrete table from the last SQL", () => {
    const parts = [
      sqlPart('SELECT 1 FROM report_aaa WHERE "X" > 0'),
      sqlPart('SELECT COUNT(*) FROM "report_bbb_123"'),
    ];
    assert.equal(extractSourceTable(parts), "report_bbb_123");
  });
  it("skips active_view and falls back to earlier concrete tables", () => {
    const parts = [
      sqlPart("SELECT * FROM report_aaa"),
      sqlPart("SELECT * FROM active_view LIMIT 10"),
    ];
    assert.equal(extractSourceTable(parts), "report_aaa");
  });
  it("returns null when only active_view was used", () => {
    assert.equal(
      extractSourceTable([sqlPart("SELECT * FROM active_view")]),
      null,
    );
  });
  it("returns null when no SQL tool calls exist", () => {
    assert.equal(
      extractSourceTable([
        {
          toolName: "profile_grid_table",
          state: "output-available",
          toolCallId: "c2",
        },
      ]),
      null,
    );
  });
});
