/**
 * Unit Tests for Diagnostic Triage Sub-Agent
 * Verifies that the nested worker sub-agent classifies errors properly,
 * adheres to timeouts, falls back reliably, and produces structured choices.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { runDiagnosticSubagent } from "./diagnostic-subagent";

describe("Diagnostic Triage Sub-Agent Tests", () => {
  it("1. Bilinen Zod/şema hatalarını Tier 1 deterministik filtre ile anında yakalamalıdır", async () => {
    const result = await runDiagnosticSubagent({
      error: "Validation error: invalid_type expected string received number at companyCode",
      componentId: "criteria_form:retail-sales-report",
      action: "SET_FIELDS",
    });

    assert.equal(result.category, "SYNTAX_OR_SCHEMA");
    assert.equal(result.isRecoverable, true);
    assert.equal(result.action, "SELF_HEAL");
    assert.ok(result.recoveryHint?.includes("şema kısıtlamalarını"));
  });

  it("2. Yetkisiz erişim (403) hatasını unrecoverable olarak işaretleyip ask_user_choice seçenekleri sunmalıdır", async () => {
    const result = await runDiagnosticSubagent({
      error: "403 Forbidden: Bu şirkete erişim yetkiniz bulunmamaktadır",
      componentId: "criteria_form:retail-sales-report",
      action: "SUBMIT",
    });

    assert.equal(result.category, "PERMISSIONS");
    assert.equal(result.isRecoverable, false);
    assert.equal(result.action, "ASK_USER_CHOICE");
    assert.ok(Array.isArray(result.suggestedChoices));
    assert.ok((result.suggestedChoices?.length || 0) >= 2);
  });

  it("3. Altyapı veya zaman aşımı (504 / timeout) hatasında tekrar deneme seçeneği üretmelidir", async () => {
    const result = await runDiagnosticSubagent({
      error: "504 Gateway Timeout: Database request timed out",
      componentId: "job_history",
      action: "RUN",
    });

    assert.equal(result.category, "INFRASTRUCTURE");
    assert.equal(result.isRecoverable, false);
    assert.equal(result.action, "ASK_USER_CHOICE");
    assert.ok(result.suggestedChoices?.some((c) => c.label === "Tekrar Dene"));
  });

  it("4. Belirsiz hatalarda zaman aşımına uğrarsa kesinti yaratmadan deterministik fallback ile tamamlanmalıdır", async () => {
    const result = await runDiagnosticSubagent({
      error: "Bilinmeyen karmaşık sistem uyarısı",
      componentId: "system",
      timeoutMs: 1, // 1ms ile hızlı timeout testi
    });

    assert.ok(result, "Sonuç nesnesi dönmelidir");
    assert.equal(result.isRecoverable, false);
    assert.equal(result.action, "ASK_USER_CHOICE");
  });
});
