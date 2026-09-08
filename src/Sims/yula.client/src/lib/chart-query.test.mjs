/**
 * chart-query birim testleri — orderMode: ilk N ≠ en yüksek N
 * Çalıştır: node --experimental-strip-types --test src/lib/chart-query.test.mjs
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const { buildChartQuery, inferChartOrderMode } = await import(
  pathToFileURL(path.join(here, "chart-query.ts")).href
);

describe("inferChartOrderMode", () => {
  it("defaults to value_desc", () => {
    assert.equal(inferChartOrderMode(undefined), "value_desc");
  });

  it("respects explicit appearance", () => {
    assert.equal(inferChartOrderMode("appearance"), "appearance");
  });

  it("ilk N without en yüksek → label_asc", () => {
    assert.equal(
      inferChartOrderMode(undefined, { title: "İlk 5 Mağaza" }),
      "label_asc",
    );
  });

  it("value_desc + ilk N title → label_asc", () => {
    assert.equal(
      inferChartOrderMode("value_desc", { title: "İlk 5 Depo Pasta" }),
      "label_asc",
    );
  });

  it("en yüksek keeps value_desc", () => {
    assert.equal(
      inferChartOrderMode(undefined, { title: "En yüksek 5 mağaza" }),
      "value_desc",
    );
  });

  it("en yüksek ilk 5 stays value_desc", () => {
    assert.equal(
      inferChartOrderMode("value_desc", {
        title: "En yüksek ilk 5 kayıt",
      }),
      "value_desc",
    );
  });
});

describe("buildChartQuery orderMode", () => {
  it("value_desc orders by metric DESC", () => {
    const sql = buildChartQuery({
      fromExpr: '"t"',
      labelKey: "Depo",
      valueKeys: ["Tutar"],
      limit: 5,
      orderMode: "value_desc",
    });
    assert.match(sql, /ORDER BY "Tutar" DESC/);
    assert.match(sql, /LIMIT 5/);
    assert.doesNotMatch(sql, /__numbered/);
  });

  it("appearance uses first-seen category order", () => {
    const sql = buildChartQuery({
      fromExpr: '"t"',
      labelKey: "Depo",
      valueKeys: ["Tutar"],
      limit: 5,
      orderMode: "appearance",
      appearanceOrderBy: '"Depo" ASC',
    });
    assert.match(sql, /ROW_NUMBER\(\) OVER \(ORDER BY "Depo" ASC\)/);
    assert.match(sql, /ORDER BY f\.first_rn/);
    assert.match(sql, /LIMIT 5/);
  });

  it("label_asc orders by label", () => {
    const sql = buildChartQuery({
      fromExpr: '"t"',
      labelKey: "Depo",
      valueKeys: ["Tutar"],
      limit: 5,
      orderMode: "label_asc",
    });
    assert.match(sql, /ORDER BY label ASC/);
  });
});
