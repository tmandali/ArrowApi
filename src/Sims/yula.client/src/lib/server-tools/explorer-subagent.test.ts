import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  matchScreenContract,
  formatExplorerFindings,
  runExplorerSubagent,
} from "./explorer-subagent";

describe("Explorer Sub-Agent (Pi Reference Pattern)", () => {
  it("1. matchScreenContract sorguyu doğru rapor kontratıyla eşleştirmelidir", () => {
    const r1 = matchScreenContract("geçen hafta satışlarını getir");
    assert.ok(r1, "Satış raporu bulunmalı");
    assert.equal(r1.scope, "retail-sales-report");
    assert.equal(r1.pagePath, "/stock/retail-sales-report");

    const r2 = matchScreenContract("stok bakiye durumu");
    assert.ok(r2, "Stok bakiye raporu bulunmalı");
    assert.equal(r2.scope, "stock-balance");
  });

  it("2. formatExplorerFindings Pi standardında yapısal Markdown bulguları üretmelidir", () => {
    const report = matchScreenContract("perakende satış")!;
    const findings = formatExplorerFindings(report);

    assert.equal(findings.status, "ok");
    assert.equal(findings.targetRoute, "/stock/retail-sales-report");
    assert.equal(findings.targetComponentId, "criteria_form:retail-sales-report");
    assert.ok(findings.requiredFields.includes("sirketKod"));
    assert.ok(findings.fieldOptions.sirketKod?.includes("TJ01"));

    // Check markdown sections matching Pi Explore Agent contract
    assert.ok(findings.findings.includes("## Screen / Contract Retrieved"));
    assert.ok(findings.findings.includes("## Key Criteria & Schema"));
    assert.ok(findings.findings.includes("## Recommended Next Step"));
    assert.ok(findings.findings.includes("ask_user_choice"));
  });

  it("3. runExplorerSubagent quick modunda deterministik hızlı yanıt dönmelidir", async () => {
    const result = await runExplorerSubagent({
      query: "geçen hafta satışları",
      thoroughness: "quick",
    });

    assert.equal(result.status, "ok");
    assert.equal(result.targetRoute, "/stock/retail-sales-report");
    assert.ok(result.findings.includes("/stock/retail-sales-report"));
  });

  it("4. Bilinmeyen sorgularda güvenli fallback çıktısı vermelidir", async () => {
    const result = await runExplorerSubagent({
      query: "tamamen bilinmeyen rastgele bir şey 12345",
      thoroughness: "quick",
    });

    assert.equal(result.status, "fallback");
    assert.ok(result.findings.includes("Unknown"));
  });
});
