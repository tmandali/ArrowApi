/**
 * Node built-in test runner: npx tsx --test src/lib/yula-finding-drill.test.ts
 * Bulgu tıklama prompt'u (saf).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildFindingDrillPrompt } from "./yula-finding-drill.ts";

describe("buildFindingDrillPrompt", () => {
  it("wraps Turkish findings with TR click context", () => {
    const out = buildFindingDrillPrompt(
      "Anonim müşteri yoğunluğu: 2.734.423 satır (%90,5) MusteriNo boş, NULL veya 0.",
    );
    assert.ok(out.startsWith("[Analiz bulgusuna tıklandı]"));
    assert.ok(out.includes("MusteriNo"));
    assert.ok(out.includes("run_expert_sql"));
  });
  it("wraps English findings with EN click context", () => {
    const out = buildFindingDrillPrompt(
      "Empty customer numbers: 10 rows with NULL CustomerNo.",
    );
    assert.ok(out.startsWith("[Analysis finding clicked]"));
    assert.ok(out.includes("run_expert_sql"));
  });
  it("truncates very long findings", () => {
    const out = buildFindingDrillPrompt(`Bulgu: ${"x".repeat(900)}`);
    assert.ok(out.length < 700);
  });
  it("pins the source table when provided", () => {
    const out = buildFindingDrillPrompt("Anonim müşteri yoğunluğu: MusteriNo boş.", "report_abc123");
    assert.ok(out.includes('FROM "report_abc123"'));
    assert.ok(out.includes("active_view değil"));
  });
});
