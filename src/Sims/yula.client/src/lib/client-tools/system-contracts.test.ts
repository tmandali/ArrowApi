import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { APP_ROUTER_NAVIGATE_CONTRACT } from "./app-router-contracts";
import {
  CRITERIA_SET_FIELDS_CONTRACT,
  CRITERIA_APPLY_CONTRACT,
  CRITERIA_SUBMIT_CONTRACT,
  CRITERIA_RUN_CONTRACT,
  CRITERIA_VALIDATE_CONTRACT,
  CRITERIA_READ_CONTRACT,
  CRITERIA_SCHEMA_CONTRACT,
} from "./criteria-form-contracts";
import {
  GRID_RUN_SQL_CONTRACT,
  GRID_QUERY_CONTRACT,
  GRID_FILTER_CONTRACT,
  GRID_APPLY_FILTERS_CONTRACT,
  GRID_SORT_CONTRACT,
  GRID_COLUMNS_CONTRACT,
  GRID_PIN_CONTRACT,
  GRID_RESET_LAYOUT_CONTRACT,
  GRID_EXPORT_CONTRACT,
  GRID_PROFILE_CONTRACT,
  GRID_ANALYZE_CONTRACT,
  GRID_VISUALIZE_CONTRACT,
} from "./result-grid-contracts";
import { executeDispatchComponentAction } from "./dispatch-bridge";
import { createGate } from "@my-agent/core";

describe("system-contracts", () => {
  describe("app-router contracts", () => {
    it("APP_ROUTER_NAVIGATE_CONTRACT validates valid and invalid input", () => {
      assert.throws(() => {
        APP_ROUTER_NAVIGATE_CONTRACT.inputSchema.parse({});
      });

      const validIn = APP_ROUTER_NAVIGATE_CONTRACT.inputSchema.parse({
        path: "/stock/retail-sales-report",
      });
      assert.equal(validIn.path, "/stock/retail-sales-report");

      const validOut = APP_ROUTER_NAVIGATE_CONTRACT.outputSchema.parse({
        success: true,
        navigatedTo: "/stock/retail-sales-report",
      });
      assert.equal(validOut.success, true);
      assert.equal(validOut.navigatedTo, "/stock/retail-sales-report");
    });

    it("dispatch bridge rejects app_router NAVIGATE when path is missing", async () => {
      const res = (await executeDispatchComponentAction({
        component_id: "app_router",
        action: "NAVIGATE",
        payload: {} as any,
      })) as { status: string; error: string };

      assert.equal(res.status, "error");
      assert.ok(res.error.length > 0);
    });

    it("dispatch bridge cooperatively aborts when Effect Gate is aborted", async () => {
      const { gate, control } = createGate();
      control.beginAbort(Promise.resolve());
      control.signalAbort();

      const res = (await executeDispatchComponentAction({
        component_id: "app_router",
        action: "NAVIGATE",
        payload: { path: "/stock/retail-sales-report" },
        gate,
      })) as { status: string; error?: string };

      assert.equal(res.status, "aborted");
    });

    it("dispatch bridge cooperatively aborts when AbortSignal is already aborted", async () => {
      const controller = new AbortController();
      controller.abort();

      const res = (await executeDispatchComponentAction({
        component_id: "app_router",
        action: "NAVIGATE",
        payload: { path: "/stock/retail-sales-report" },
        signal: controller.signal,
      })) as { status: string };

      assert.equal(res.status, "aborted");
    });
  });

  describe("criteria-form contracts", () => {
    it("CRITERIA_SET_FIELDS_CONTRACT validates criteria mutation input and output", () => {
      assert.throws(() => {
        CRITERIA_SET_FIELDS_CONTRACT.inputSchema.parse({});
      });

      const input = CRITERIA_SET_FIELDS_CONTRACT.inputSchema.parse({
        criteria: { sirketKod: "TRLC", depoKod: "D01" },
      });
      assert.equal(input.criteria.sirketKod, "TRLC");

      const output = CRITERIA_SET_FIELDS_CONTRACT.outputSchema.parse({
        success: true,
        updatedFields: ["sirketKod", "depoKod"],
      });
      assert.equal(output.success, true);
      assert.equal(output.updatedFields?.length, 2);
    });

    it("CRITERIA_APPLY_CONTRACT, CRITERIA_SUBMIT_CONTRACT & CRITERIA_RUN_CONTRACT validate payloads", () => {
      const applyIn = CRITERIA_APPLY_CONTRACT.inputSchema.parse({
        criteria: { sirketKod: "TRLC" },
        report: "retail-sales-report",
      });
      assert.equal(applyIn.report, "retail-sales-report");

      const submitIn = CRITERIA_SUBMIT_CONTRACT.inputSchema.parse({});
      assert.equal(submitIn.report, undefined);

      const submitOut = CRITERIA_SUBMIT_CONTRACT.outputSchema.parse({
        success: true,
        jobId: "job-abc",
        queued: true,
      });
      assert.equal(submitOut.jobId, "job-abc");

      const runIn = CRITERIA_RUN_CONTRACT.inputSchema.parse({
        criteria: { sirketKod: "TRLC" },
      });
      assert.equal(runIn.criteria?.sirketKod, "TRLC");

      const runOut = CRITERIA_RUN_CONTRACT.outputSchema.parse({
        success: true,
        jobId: "job-xyz",
      });
      assert.equal(runOut.jobId, "job-xyz");
    });

    it("CRITERIA_VALIDATE_CONTRACT & CRITERIA_READ_CONTRACT validate schemas", () => {
      const valIn = CRITERIA_VALIDATE_CONTRACT.inputSchema.parse({
        criteria: { sirketKod: "TRLC" },
      });
      assert.equal(valIn.criteria.sirketKod, "TRLC");

      const valOut = CRITERIA_VALIDATE_CONTRACT.outputSchema.parse({
        valid: false,
        errors: ["Field sirketKod is required"],
      });
      assert.equal(valOut.valid, false);
      assert.equal(valOut.errors?.length, 1);

      const readIn = CRITERIA_READ_CONTRACT.inputSchema.parse({
        report: "retail-sales-report",
      });
      assert.equal(readIn.report, "retail-sales-report");

      const readOut = CRITERIA_READ_CONTRACT.outputSchema.parse({
        criteria: { sirketKod: "TRLC" },
      });
      assert.equal(readOut.criteria.sirketKod, "TRLC");
    });

    it("CRITERIA_SCHEMA_CONTRACT discovers report schema", async () => {
      const parsedIn = CRITERIA_SCHEMA_CONTRACT.inputSchema.parse({
        report: "retail-sales-report",
      });
      assert.equal(parsedIn.report, "retail-sales-report");

      const res = (await executeDispatchComponentAction({
        component_id: "criteria_form:retail-sales-report",
        action: "SCHEMA",
        payload: { report: "retail-sales-report" },
      })) as { status: string; criteria?: unknown[] };

      assert.equal(res.status, "ok");
      assert.ok(Array.isArray(res.criteria));
      const parsedOut = CRITERIA_SCHEMA_CONTRACT.outputSchema.parse(res);
      assert.equal(parsedOut.status, "ok");
    });
  });

  describe("result-grid contracts", () => {
    it("GRID_RUN_SQL_CONTRACT & GRID_QUERY_CONTRACT validate query inputs", () => {
      assert.throws(() => {
        GRID_RUN_SQL_CONTRACT.inputSchema.parse({});
      });

      const sqlIn = GRID_RUN_SQL_CONTRACT.inputSchema.parse({
        query: "SELECT Depo, SUM(Tutar) FROM active_view GROUP BY 1",
      });
      assert.ok(sqlIn.query?.includes("SELECT"));

      const sqlAliasIn = GRID_RUN_SQL_CONTRACT.inputSchema.parse({
        sql: "SELECT * FROM active_view LIMIT 5",
      });
      assert.ok(sqlAliasIn.sql?.includes("SELECT"));

      const sqlOut = GRID_RUN_SQL_CONTRACT.outputSchema.parse({
        rows: [{ Depo: "D01", Tutar: 100 }],
        rowCount: 1,
      });
      assert.equal(sqlOut.rowCount, 1);

      const queryIn = GRID_QUERY_CONTRACT.inputSchema.parse({
        query: "SELECT * FROM active_view",
      });
      assert.equal(queryIn.query, "SELECT * FROM active_view");

      const queryResetIn = GRID_QUERY_CONTRACT.inputSchema.parse({
        reset: true,
      });
      assert.equal(queryResetIn.reset, true);
    });

    it("GRID_FILTER_CONTRACT & GRID_APPLY_FILTERS_CONTRACT validate filter operations", () => {
      const filterIn = GRID_FILTER_CONTRACT.inputSchema.parse({
        field: "Depo",
        value: "D01",
      });
      assert.equal(filterIn.field, "Depo");
      assert.equal(filterIn.op, "eq"); // default op

      const multiFilterIn = GRID_APPLY_FILTERS_CONTRACT.inputSchema.parse({
        filters: { Depo: "D01", SatisTipi: "Normal" },
        clearOthers: true,
      });
      assert.equal(multiFilterIn.filters.Depo, "D01");
      assert.equal(multiFilterIn.clearOthers, true);
    });

    it("GRID_SORT_CONTRACT enforces asc or desc direction", () => {
      assert.throws(() => {
        GRID_SORT_CONTRACT.inputSchema.parse({
          column: "Tutar",
          direction: "invalid" as any,
        });
      });

      const sortIn = GRID_SORT_CONTRACT.inputSchema.parse({
        column: "Tutar",
        direction: "desc",
      });
      assert.equal(sortIn.direction, "desc");
    });

    it("GRID_COLUMNS_CONTRACT, PIN, RESET_LAYOUT & EXPORT validate layouts", () => {
      const colIn = GRID_COLUMNS_CONTRACT.inputSchema.parse({
        visibleColumns: ["Depo", "Tutar"],
        hiddenColumns: ["Maliyet"],
      });
      assert.deepEqual(colIn.visibleColumns, ["Depo", "Tutar"]);

      const pinIn = GRID_PIN_CONTRACT.inputSchema.parse({
        columns: ["Depo"],
      });
      assert.deepEqual(pinIn.columns, ["Depo"]);

      const resetIn = GRID_RESET_LAYOUT_CONTRACT.inputSchema.parse({});
      assert.equal(resetIn.resetFilters, true);
      assert.equal(resetIn.resetSort, true);

      const exportIn = GRID_EXPORT_CONTRACT.inputSchema.parse({
        format: "parquet",
      });
      assert.equal(exportIn.format, "parquet");
    });

    it("GRID_PROFILE, ANALYZE & VISUALIZE contracts validate data science operations", () => {
      const profileIn = GRID_PROFILE_CONTRACT.inputSchema.parse({});
      assert.deepEqual(profileIn, {});

      const analyzeIn = GRID_ANALYZE_CONTRACT.inputSchema.parse({
        columns: ["Tutar", "Miktar"],
      });
      assert.deepEqual(analyzeIn.columns, ["Tutar", "Miktar"]);

      const visIn = GRID_VISUALIZE_CONTRACT.inputSchema.parse({
        type: "bar",
        dimension: "Depo",
        metric: "Tutar",
      });
      assert.equal(visIn.type, "bar");
      assert.equal(visIn.dimension, "Depo");

      const visInAliases = GRID_VISUALIZE_CONTRACT.inputSchema.parse({
        chartType: "line",
        dimensionX: "Mağaza",
        dimensionY: "Satış Tutarı",
        limit: 5,
        extraFlag: true,
      });
      assert.equal(visInAliases.chartType, "line");
      assert.equal(visInAliases.dimensionX, "Mağaza");
      assert.equal(visInAliases.dimensionY, "Satış Tutarı");
      assert.equal(visInAliases.limit, 5);
      assert.equal((visInAliases as any).extraFlag, true);
    });

    it("records TABLE_LOADED event on uiEventBus under data topic", async () => {
      const { uiEventBus } = await import("@my-agent/core");
      uiEventBus.recordTelemetry({
        source: "result_grid",
        type: "TABLE_LOADED",
        payload: {
          tableName: "report_12345",
          activeView: "active_view",
          columns: ["Depo", "Tutar"],
          rowCount: 50,
        },
      });

      const events = uiEventBus.getRecentEvents({ topic: "data", type: "TABLE_LOADED" });
      assert.ok(events.length > 0);
      const last = events[events.length - 1];
      assert.equal(last.source, "result_grid");
      assert.equal(last.topic, "data");
      assert.deepEqual(last.payload.columns, ["Depo", "Tutar"]);
    });
  });
});
