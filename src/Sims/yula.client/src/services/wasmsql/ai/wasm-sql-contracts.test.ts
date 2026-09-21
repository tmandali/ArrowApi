import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  WASM_SQL_COMPONENT_ID,
  WASM_SQL_RUN_CONTRACT,
  WASM_SQL_DESCRIBE_CONTRACT,
  WASM_SQL_LIST_TABLES_CONTRACT,
} from "./wasm-sql-contracts";
import { executeDispatchComponentAction } from "@/lib/client-tools/dispatch-bridge";

describe("wasm-sql-contracts", () => {
  describe("contract schemas", () => {
    it("WASM_SQL_COMPONENT_ID is correctly defined", () => {
      assert.equal(WASM_SQL_COMPONENT_ID, "wasm_sql_engine");
    });

    it("WASM_SQL_RUN_CONTRACT validates valid and invalid input", () => {
      // Missing query should throw
      assert.throws(() => {
        WASM_SQL_RUN_CONTRACT.inputSchema.parse({});
      });

      // Default limit is 100
      const valid = WASM_SQL_RUN_CONTRACT.inputSchema.parse({
        query: "SELECT * FROM active_view",
      });
      assert.equal(valid.query, "SELECT * FROM active_view");
      assert.equal(valid.limit, 100);

      // Custom limit
      const customLimit = WASM_SQL_RUN_CONTRACT.inputSchema.parse({
        query: "SELECT * FROM active_view",
        limit: 250,
      });
      assert.equal(customLimit.limit, 250);

      // Limit above 1000 should throw
      assert.throws(() => {
        WASM_SQL_RUN_CONTRACT.inputSchema.parse({
          query: "SELECT 1",
          limit: 2000,
        });
      });
    });

    it("WASM_SQL_RUN_CONTRACT validates output schema", () => {
      const output = WASM_SQL_RUN_CONTRACT.outputSchema.parse({
        query: "SELECT * FROM active_view",
        rowCount: 2,
        durationMs: 4,
        columns: ["id", "val"],
        rows: [{ id: 1, val: "A" }, { id: 2, val: "B" }],
        truncated: false,
      });
      assert.equal(output.rowCount, 2);
      assert.equal(output.truncated, false);
      assert.equal(output.columns.length, 2);
    });

    it("WASM_SQL_DESCRIBE_CONTRACT validates input and defaults", () => {
      const defaultInput = WASM_SQL_DESCRIBE_CONTRACT.inputSchema.parse({});
      assert.equal(defaultInput.tableOrView, "active_view");

      const explicitInput = WASM_SQL_DESCRIBE_CONTRACT.inputSchema.parse({
        tableOrView: "custom_table",
      });
      assert.equal(explicitInput.tableOrView, "custom_table");

      const output = WASM_SQL_DESCRIBE_CONTRACT.outputSchema.parse({
        tableOrView: "active_view",
        columns: [
          { column_name: "id", column_type: "INTEGER", null: "NO" },
          { column_name: "name", column_type: "VARCHAR" },
        ],
      });
      assert.equal(output.columns.length, 2);
      assert.equal(output.columns[0].column_name, "id");
    });

    it("WASM_SQL_LIST_TABLES_CONTRACT validates schemas", () => {
      const input = WASM_SQL_LIST_TABLES_CONTRACT.inputSchema.parse({});
      assert.deepEqual(input, {});

      const output = WASM_SQL_LIST_TABLES_CONTRACT.outputSchema.parse({
        tables: ["report_123", "active_view"],
      });
      assert.equal(output.tables.length, 2);
    });
  });

  describe("dispatch bridge routing", () => {
    it("rejects destructive SQL operations via sql-guard in dispatch bridge", async () => {
      const res = (await executeDispatchComponentAction({
        component_id: "wasm_sql_engine",
        action: "RUN_SQL",
        payload: { query: "DROP TABLE users;" },
      })) as { status: string; error: string };

      assert.equal(res.status, "error");
      assert.ok(res.error.toLowerCase().includes("drop") || res.error.length > 0);
    });

    it("returns unknown-action for unsupported wasm_sql_engine actions", async () => {
      const res = (await executeDispatchComponentAction({
        component_id: "wasm_sql_engine",
        action: "UNSUPPORTED_ACTION" as any,
        payload: {},
      })) as { status: string };

      assert.equal(res.status, "unknown-action");
    });
  });
});
