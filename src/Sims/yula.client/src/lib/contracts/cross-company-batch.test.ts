import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  executeSegregatedBatch,
  formatSegregatedBatchReport,
  type CompanyBatchItem,
} from "./cross-company-batch";

describe("CrossCompanySegregatedBatch", () => {
  it("executes orders isolated across multiple companies and captures per-tenant errors without cross-contamination", async () => {
    const orders: CompanyBatchItem<{ amount: number; supplierVatValid?: boolean }>[] = [
      {
        id: "SIP-101",
        companyId: "comp_tr",
        companyName: "XYZ Türkiye A.Ş.",
        countryCode: "TR",
        payload: { amount: 150000 },
      },
      {
        id: "SIP-102",
        companyId: "comp_tr",
        companyName: "XYZ Türkiye A.Ş.",
        countryCode: "TR",
        payload: { amount: 85000 },
      },
      {
        id: "PO-DE-44",
        companyId: "comp_de",
        companyName: "XYZ GmbH - Deutschland",
        countryCode: "DE",
        payload: { amount: 14200, supplierVatValid: true },
      },
      {
        id: "PO-DE-45",
        companyId: "comp_de",
        companyName: "XYZ GmbH - Deutschland",
        countryCode: "DE",
        payload: { amount: 8500, supplierVatValid: false }, // Will fail GoBD validation!
      },
      {
        id: "PO-US-09",
        companyId: "comp_us",
        companyName: "XYZ Americas Inc.",
        countryCode: "US",
        payload: { amount: 4200 },
      },
    ];

    // Executor simulating company-specific validation
    const executor = async (item: (typeof orders)[0]) => {
      if (item.countryCode === "DE" && !item.payload.supplierVatValid) {
        throw new Error("GoBD & VIES KDV kaydı doğrulanamadı.");
      }
      return { approvedAt: new Date().toISOString() };
    };

    const summary = await executeSegregatedBatch(orders, executor);

    assert.equal(summary.totalCompanies, 3);
    assert.equal(summary.totalItems, 5);
    assert.equal(summary.totalSucceeded, 4);
    assert.equal(summary.totalFailed, 1);

    // TR verification
    const trGroup = summary.byCompany["comp_tr"];
    assert.equal(trGroup.succeededCount, 2);
    assert.equal(trGroup.failedCount, 0);

    // DE verification: 1 succeeded, 1 failed
    const deGroup = summary.byCompany["comp_de"];
    assert.equal(deGroup.succeededCount, 1);
    assert.equal(deGroup.failedCount, 1);
    assert.equal(deGroup.items[1].success, false);
    assert.ok(deGroup.items[1].error?.includes("GoBD & VIES"));

    // US verification: 1 succeeded
    const usGroup = summary.byCompany["comp_us"];
    assert.equal(usGroup.succeededCount, 1);

    // Report format test
    const report = formatSegregatedBatchReport(summary);
    assert.ok(report.includes("🇹🇷 XYZ Türkiye A.Ş. (2/2 Onaylandı)"));
    assert.ok(report.includes("🇩🇪 XYZ GmbH - Deutschland (1/2 Onaylandı)"));
    assert.ok(report.includes("🇺🇸 XYZ Americas Inc. (1/1 Onaylandı)"));
    assert.ok(report.includes("GoBD & VIES"));
  });
});
