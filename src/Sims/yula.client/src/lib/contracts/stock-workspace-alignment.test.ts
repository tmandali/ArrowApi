import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { stockLedgerContext } from "../../workspaces/stock/stock-ledger";
import { stockAnalyticsContext } from "../../workspaces/stock/stock-analytics";
import { retailSalesContext } from "../../workspaces/stock/retail-sales-report";
import { stockOrchestrator } from "../../workspaces/stock/stock.orchestrator";
import { executeSaga } from "./workflow-orchestrator";
import { formatBoundedContextPrompt } from "./bounded-context";

describe("Stock Workspace Alignment: Analytical Contexts & Stock Orchestrator", () => {
  describe("1. Stock Analytical Contexts (CQRS Read Models)", () => {
    it("configures Stock Ledger as an analytical context with correct criteria fields", () => {
      assert.equal(stockLedgerContext.type, "analytical");
      assert.equal(stockLedgerContext.workspace, "stock");
      assert.ok(stockLedgerContext.state.fields?.warehouse);
      assert.ok(stockLedgerContext.state.fields?.item_code);
      assert.ok(stockLedgerContext.state.fields?.batch_no);
      assert.equal(stockLedgerContext.process, undefined); // No state machine for CQRS read model

      const prompt = formatBoundedContextPrompt(stockLedgerContext);
      assert.ok(prompt.includes("StockLedgerReport"));
      assert.ok(prompt.includes("type=\"analytical\""));
    });

    it("configures Stock Analytics with trend and turnover criteria", () => {
      assert.equal(stockAnalyticsContext.type, "analytical");
      assert.ok(stockAnalyticsContext.state.fields?.range_type);
      assert.ok(stockAnalyticsContext.state.fields?.year);
      assert.equal(stockAnalyticsContext.process, undefined);
    });

    it("configures Retail Sales Report with POS and cashier criteria", () => {
      assert.equal(retailSalesContext.type, "analytical");
      assert.ok(retailSalesContext.state.fields?.pos_profile);
      assert.ok(retailSalesContext.state.fields?.cashier);
      assert.equal(retailSalesContext.process, undefined);
    });
  });

  describe("2. Stock Orchestrator Sagas", () => {
    it("executes inter-warehouse transfer saga with TR GİB e-İrsaliye injection", async () => {
      const saga = stockOrchestrator.sagas["stock:inter-warehouse-transfer"];
      const result = await executeSaga(
        saga,
        {
          fromWarehouse: "WH-CENTRAL",
          toWarehouse: "WH-BRANCH-1",
          itemCode: "ITM-100",
          qty: 50,
        },
        { countryCode: "TR" },
      );

      assert.equal(result.status, "completed");
      assert.equal((result.results["issue-transfer-dispatch"] as any)?.status, "DispatchedFromSource");
      assert.equal((result.results["gib-sign-internal-dispatch"] as any)?.gibSigned, true);
      assert.equal((result.results["admit-target-receipt"] as any)?.status, "CompletedAndAdmitted");
      assert.equal((result.results["admit-target-receipt"] as any)?.admittedQty, 50);
    });

    it("executes inter-warehouse transfer saga with DE GoBD hash injection", async () => {
      const saga = stockOrchestrator.sagas["stock:inter-warehouse-transfer"];
      const result = await executeSaga(
        saga,
        {
          fromWarehouse: "WH-BERLIN",
          toWarehouse: "WH-MUNICH",
          itemCode: "ITM-200",
          qty: 25,
        },
        { countryCode: "DE" },
      );

      assert.equal(result.status, "completed");
      assert.equal((result.results["gobd-transfer-hash"] as any)?.auditVerified, true);
      assert.equal((result.results["admit-target-receipt"] as any)?.status, "CompletedAndAdmitted");
    });

    it("executes inventory reconciliation for standard discrepancies without HITL", async () => {
      const saga = stockOrchestrator.sagas["stock:inventory-reconciliation"];
      const result = await executeSaga(
        saga,
        {
          warehouse: "WH-MAIN",
          itemCode: "ITM-FAST",
          physicalQty: 95,
          systemQty: 100, // diff: -5
          unitCost: 100, // discrepancy amount: 500 TL (< 50,000)
        },
      );

      assert.equal(result.status, "completed");
      assert.equal((result.results["post-valuation-adjustment"] as any)?.status, "AdjustmentPosted");
      assert.equal((result.results["post-valuation-adjustment"] as any)?.adjustedQty, -5);
    });

    it("suspends inventory reconciliation on HITL gateway when discrepancy exceeds threshold", async () => {
      const saga = stockOrchestrator.sagas["stock:inventory-reconciliation"];
      const result = await executeSaga(
        saga,
        {
          warehouse: "WH-MAIN",
          itemCode: "ITM-EXPENSIVE-SERVER",
          physicalQty: 2,
          systemQty: 10, // diff: -8
          unitCost: 10_000, // discrepancy amount: 80,000 TL (> 50,000)
        },
      );

      assert.equal(result.status, "hitl_waiting");
      assert.ok(result.hitlCheckpoint);
      assert.equal(result.hitlCheckpoint?.stepId, "post-valuation-adjustment");
      assert.ok(result.hitlCheckpoint?.reason.includes("50,000 TL"));
    });
  });
});
