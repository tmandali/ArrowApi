/**
 * Unit Tests for Playbook Retrieval Sub-Agent
 * Verifies that the isolated sub-agent executes cleanly, resolves natural language
 * intent, falls back safely on provider timeouts/failures, and prevents confabulation.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { runPlaybookSubagent } from "./playbook-subagent";

describe("Playbook Retrieval Sub-Agent Tests", () => {
  it("1. Var olan kurumsal reçeteyi (satınalma) başarıyla bulmalı ve bağlam döndürmelidir", async () => {
    const result = await runPlaybookSubagent({
      task: "Satınalma siparişi ve mal kabul süreci",
      workspace: "stock",
      timeoutMs: 50, // Test ortamında hızlıca güvenli fallback'e düşsün
    });

    assert.ok(result.matched, "Satınalma reçetesi eşleşmelidir");
    assert.ok(result.recipe, "Reçete nesnesi dönmelidir");
    assert.equal(result.recipe?.id, "recipe-purchasing-flow");
    assert.ok(result.recipe?.title.includes("Satınalma"));
    assert.ok(result.confidence > 0, "Güven skoru 0'dan büyük olmalıdır");
    assert.ok(result.explanation.length > 0, "Açıklama metni dönmelidir");
  });

  it("2. Olmayan bir iş akışı için confabulation yapmamalı (not_found dönmelidir)", async () => {
    const result = await runPlaybookSubagent({
      task: "Uzay Mekiği Fırlatma ve Yörüngeye Oturtma Prosedürü",
      workspace: "stock",
      timeoutMs: 50,
    });

    assert.equal(result.matched, false, "Uydurma reçete eşleşmemelidir");
    assert.equal(result.recipe, null, "Reçete null olmalıdır");
    assert.equal(result.status, "not_found");
    assert.ok(result.explanation.includes("No verified playbook recipe found"));
  });

  it("3. Ekran rotası sorgulandığında ilgili ekran kurallarını getirmelidir", async () => {
    const result = await runPlaybookSubagent({
      task: "/stock/stock-balance",
      workspace: "stock",
      timeoutMs: 50,
    });

    assert.ok(Array.isArray(result.screenRules), "Ekran kuralları dizisi dönmelidir");
  });

  it("4. Hata ve zaman aşımı durumunda kesinti yaratmadan fallback ile tamamlanmalıdır", async () => {
    const result = await runPlaybookSubagent({
      task: "Satınalma",
      workspace: "stock",
      timeoutMs: 1, // 1 ms zaman aşımı simülasyonu
    });

    assert.ok(result, "Sonuç nesnesi dönmelidir");
    assert.ok(result.matched, "Fallback ile satınalma bulunabilmelidir");
    assert.equal(result.recipe?.id, "recipe-purchasing-flow");
  });
});
