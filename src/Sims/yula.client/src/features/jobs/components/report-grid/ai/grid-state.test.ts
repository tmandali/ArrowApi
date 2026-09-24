import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isResultGridMeta,
  resolveEffectiveGrid,
  type YulaGridContext,
} from "./grid-state";

describe("VirtualGrid State Type Guards", () => {
  it("validates correct result grid metadata structure", () => {
    assert.equal(isResultGridMeta({ tableName: "rep", columns: ["A"] }), true);
    assert.equal(isResultGridMeta(null), false);
    assert.equal(isResultGridMeta(undefined), false);
    assert.equal(isResultGridMeta({ tableName: "", columns: [] }), false);
  });

  it("resolves effective grid prioritizing explicit context.grid", () => {
    const explicitGrid: YulaGridContext = {
      tableName: "custom_table",
      columns: ["Col1", "Col2"],
      rowCount: 100,
    };
    const res = resolveEffectiveGrid({ grid: explicitGrid }, []);
    assert.equal(res?.tableName, "custom_table");
    assert.equal(res?.rowCount, 100);
  });

  it("extracts and normalizes grid metadata from mounted result_grid:active component", () => {
    const res = resolveEffectiveGrid(undefined, [
      {
        id: "result_grid:active",
        meta: {
          tableName: "report_c07ec130",
          columns: ["Depo", "Tutar"],
          rowCount: 450,
          filters: { Depo: "T006" },
        },
      } as any,
    ]);

    assert.equal(res?.tableName, "report_c07ec130");
    assert.deepEqual(res?.columns, ["Depo", "Tutar"]);
    assert.equal(res?.rowCount, 450);
    assert.deepEqual(res?.filters, { Depo: "T006" });
  });

  it("returns undefined if no matching result_grid component is mounted", () => {
    const res = resolveEffectiveGrid(undefined, [
      { id: "app_router", meta: {} } as any,
    ]);
    assert.equal(res, undefined);
  });
});
