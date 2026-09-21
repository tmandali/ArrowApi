import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseChartOutput } from "./yula-chart-utils.ts";

describe("parseChartOutput", () => {
  it("standart chart çıktısını parse eder", () => {
    const output = {
      status: "ok",
      chart: {
        chartType: "bar",
        dimensionX: "Mağaza",
        dimensionY: ["Satış Tutarı"],
        title: "Top Mağazalar",
      },
      rows: [
        { Mağaza: "T385", "Satış Tutarı": 100 },
        { Mağaza: "T075", "Satış Tutarı": 90 },
      ],
    };

    const parsed = parseChartOutput(output);
    assert.ok(parsed);
    assert.equal(parsed.chartType, "bar");
    assert.equal(parsed.dimensionX, "Mağaza");
    assert.deepEqual(parsed.dimensionY, ["Satış Tutarı"]);
    assert.equal(parsed.title, "Top Mağazalar");
    assert.equal(parsed.rows.length, 2);
  });

  it("dispatch_component_action tarafından sarılmış details çıktısını doğru unwrap eder", () => {
    const wrappedOutput = {
      content: [{ type: "text", text: "{}" }],
      details: {
        status: "ok",
        chart: {
          chartType: "bar",
          dimensionX: "Mağaza",
          dimensionY: ["Satış Tutarı"],
        },
        rows: [{ Mağaza: "T385", "Satış Tutarı": 100 }],
      },
    };

    const parsed = parseChartOutput(wrappedOutput);
    assert.ok(parsed);
    assert.equal(parsed.dimensionX, "Mağaza");
    assert.equal(parsed.rows.length, 1);
  });

  it("area grafik tipini line olarak haritalar", () => {
    const output = {
      status: "ok",
      chart: {
        chartType: "area",
        dimensionX: "Tarih",
        dimensionY: ["Tutar"],
      },
      rows: [{ Tarih: "2026-01-01", Tutar: 50 }],
    };

    const parsed = parseChartOutput(output);
    assert.ok(parsed);
    assert.equal(parsed.chartType, "line");
  });

  it("hata durumunda null döner", () => {
    const errorOutput = {
      status: "error",
      error: "Invalid category column: ",
    };

    assert.equal(parseChartOutput(errorOutput), null);
    assert.equal(parseChartOutput(null), null);
  });
});
