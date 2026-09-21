import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatGridPromptGrounding,
  isResultGridMeta,
  resolveEffectiveGrid,
  type YulaGridContext,
} from "./grid-agent-grounding";

describe("VirtualGrid AI Grounding & Type Guards", () => {
  it("formats base table view prompt correctly without custom query", () => {
    const grid: YulaGridContext = {
      tableName: "report_c07ec130",
      baseTable: "report_c07ec130",
      isBaseTable: true,
      columns: ["Magaza", "Tutar"],
      rowCount: 100,
    };
    const res = formatGridPromptGrounding(grid);
    assert.ok(res.includes("VIEW MODE: BASE TABLE VIEW"));
    assert.ok(res.includes('• Base Physical Table: "report_c07ec130"'));
    assert.ok(res.includes('• Active table: report_c07ec130 · 100 rows.'));
    assert.ok(res.includes('Columns: Magaza, Tutar.'));
  });

  it("formats saved query view with ID and available views list", () => {
    const grid: YulaGridContext = {
      tableName: "report_raw_guid",
      baseTable: "report_raw_guid",
      isBaseTable: false,
      activeAiViewId: "view_stores",
      customQueryTitle: "Mağaza Satışları",
      customQuerySql: 'SELECT "Magaza", SUM("Tutar") FROM "report_raw_guid" GROUP BY "Magaza"',
      columns: ["Magaza", "Toplam Tutar"],
      rowCount: 10,
      savedViews: [
        { id: "view_stores", title: "Mağaza Satışları", sql: "SELECT..." },
        { id: "view_regions", title: "Bölge Satışları", sql: "SELECT..." },
      ],
    };
    const res = formatGridPromptGrounding(grid);
    assert.ok(res.includes('VIEW MODE: SAVED QUERY [ID: "view_stores"] ("Mağaza Satışları")'));
    assert.ok(res.includes('• Base Physical Table: "report_raw_guid"'));
    assert.ok(res.includes('AVAILABLE SAVED VIEWS: ["Mağaza Satışları" (ID: view_stores), "Bölge Satışları" (ID: view_regions)]'));
  });

  it("validates result grid metadata type guard", () => {
    assert.equal(isResultGridMeta({ tableName: "rep", columns: ["A"] }), true);
    assert.equal(isResultGridMeta(null), false);
    assert.equal(isResultGridMeta({ tableName: "", columns: [] }), false);
  });

  it("resolves effective grid from active components", () => {
    const res = resolveEffectiveGrid(undefined, [
      {
        id: "result_grid:active",
        meta: {
          tableName: "t1",
          baseTable: "t1",
          columns: ["C1"],
          rowCount: 50,
        },
      } as any,
    ]);
    assert.equal(res?.tableName, "t1");
    assert.equal(res?.rowCount, 50);
  });
});
