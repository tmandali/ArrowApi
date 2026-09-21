import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  guardReadOnlySelect,
  resolveActiveViewReferences,
  normalizeQueryForStorage,
  PORTABLE_TABLE_PLACEHOLDER,
} from "./sql-guard";

describe("sql-guard: guardReadOnlySelect", () => {
  it("permits standard SELECT queries and adds default LIMIT", () => {
    const res = guardReadOnlySelect('SELECT * FROM "active_view"');
    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.sql, 'SELECT * FROM "active_view" LIMIT 200');
      assert.equal(res.limited, true);
    }
  });

  it("does not append extra LIMIT if already present", () => {
    const res = guardReadOnlySelect('SELECT * FROM "active_view" LIMIT 10');
    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.sql, 'SELECT * FROM "active_view" LIMIT 10');
      assert.equal(res.limited, false);
    }
  });

  it("permits WITH (CTE) queries", () => {
    const res = guardReadOnlySelect(
      'WITH top_stores AS (SELECT "Depo", SUM("Tutar") AS s FROM "active_view" GROUP BY "Depo") SELECT * FROM top_stores LIMIT 5'
    );
    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.limited, false);
    }
  });

  it("permits DESCRIBE and DESC without appending LIMIT", () => {
    const res1 = guardReadOnlySelect("DESCRIBE active_view");
    assert.equal(res1.ok, true);
    if (res1.ok) {
      assert.equal(res1.sql, "DESCRIBE active_view");
      assert.equal(res1.limited, false);
    }

    const res2 = guardReadOnlySelect('DESC "report_12345678_1234_1234_1234_123456789abc"');
    assert.equal(res2.ok, true);
    if (res2.ok) {
      assert.equal(res2.sql, 'DESC "report_12345678_1234_1234_1234_123456789abc"');
      assert.equal(res2.limited, false);
    }
  });

  it("permits SHOW and SUMMARIZE queries", () => {
    const res1 = guardReadOnlySelect("SHOW tables");
    assert.equal(res1.ok, true);
    if (res1.ok) {
      assert.equal(res1.sql, "SHOW tables");
      assert.equal(res1.limited, false);
    }

    const res2 = guardReadOnlySelect("SUMMARIZE active_view");
    assert.equal(res2.ok, true);
    if (res2.ok) {
      assert.equal(res2.sql, "SUMMARIZE active_view");
      assert.equal(res2.limited, false);
    }
  });

  it("blocks DDL and mutation statements", () => {
    const queries = [
      "DROP TABLE active_view",
      "INSERT INTO active_view VALUES (1)",
      "UPDATE active_view SET x = 1",
      "DELETE FROM active_view",
      "ALTER TABLE active_view ADD COLUMN x INT",
      "CREATE TABLE dummy AS SELECT 1",
      "PRAGMA version",
    ];
    for (const q of queries) {
      const res = guardReadOnlySelect(q);
      assert.equal(res.ok, false, `Expected query to be blocked: ${q}`);
    }
  });

  it("blocks file reading functions", () => {
    const res = guardReadOnlySelect("SELECT * FROM read_parquet('file.parquet')");
    assert.equal(res.ok, false);
  });
});

describe("sql-guard: resolveActiveViewReferences & normalizeQueryForStorage", () => {
  const baseTable = "report_c07ec130_7f37_41e1_b196_e666ecd33293";

  it("resolves active_view to current base table", () => {
    const sql = "SELECT * FROM active_view WHERE Depo = 'T006'";
    const resolved = resolveActiveViewReferences(sql, baseTable);
    assert.ok(resolved.includes(`"${baseTable}"`));
    assert.ok(!resolved.includes("active_view"));
  });

  it("normalizes base table reference to active_view placeholder for storage", () => {
    const sql = `SELECT * FROM "${baseTable}" WHERE Depo = 'T006'`;
    const normalized = normalizeQueryForStorage(sql, baseTable);
    assert.ok(normalized.includes(PORTABLE_TABLE_PLACEHOLDER));
    assert.ok(!normalized.includes(baseTable));
  });
});
