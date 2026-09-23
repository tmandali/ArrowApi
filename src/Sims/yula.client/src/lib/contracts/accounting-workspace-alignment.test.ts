import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { generalLedgerContext } from "../../workspaces/accounting/general-ledger";
import { customerLedgerContext } from "../../workspaces/accounting/customer-ledger";
import { supplierLedgerContext } from "../../workspaces/accounting/supplier-ledger";
import { accountingOrchestrator } from "../../workspaces/accounting/accounting.orchestrator";
import { executeSaga } from "./workflow-orchestrator";
import { formatBoundedContextPrompt } from "./bounded-context";

describe("Accounting Workspace Alignment: Ledgers & Accounting Orchestrator", () => {
  describe("1. Accounting Analytical Contexts (Ledgers)", () => {
    it("configures General Ledger as an analytical context with accounting criteria", () => {
      assert.equal(generalLedgerContext.type, "analytical");
      assert.equal(generalLedgerContext.workspace, "accounting");
      assert.ok(generalLedgerContext.state.fields?.account);
      assert.ok(generalLedgerContext.state.fields?.cost_center);
      assert.equal(generalLedgerContext.process, undefined);

      const prompt = formatBoundedContextPrompt(generalLedgerContext);
      assert.ok(prompt.includes("GeneralLedgerReport"));
      assert.ok(prompt.includes("type=\"analytical\""));
    });

    it("configures Customer Ledger with party reference key", () => {
      assert.equal(customerLedgerContext.type, "analytical");
      assert.equal(customerLedgerContext.partyReferenceKey, "customer");
      assert.ok(customerLedgerContext.state.fields?.customer);
      assert.ok(customerLedgerContext.state.fields?.currency);
    });

    it("configures Supplier Ledger with party reference key", () => {
      assert.equal(supplierLedgerContext.type, "analytical");
      assert.equal(supplierLedgerContext.partyReferenceKey, "supplier");
      assert.ok(supplierLedgerContext.state.fields?.supplier);
      assert.ok(supplierLedgerContext.state.fields?.currency);
    });
  });

  describe("2. Accounting Orchestrator Sagas", () => {
    it("executes monthly period closing saga successfully without HITL", async () => {
      const saga = accountingOrchestrator.sagas["accounting:period-closing"];
      const result = await executeSaga(
        saga,
        {
          company: "COMP-001",
          fiscalYear: 2026,
          period: 9,
          periodType: "month",
        },
      );

      assert.equal(result.status, "completed");
      assert.equal((result.results["verify-unposted-drafts"] as any)?.unpostedCount, 0);
      assert.equal((result.results["validate-trial-balance"] as any)?.trialBalanceBalanced, true);
      assert.equal((result.results["lock-accounting-period"] as any)?.periodStatus, "Locked");
      assert.ok((result.results["lock-accounting-period"] as any)?.lockId.includes("COMP-001-2026-P9"));
    });

    it("suspends fiscal year closing on HITL gateway requiring CFO signoff", async () => {
      const saga = accountingOrchestrator.sagas["accounting:period-closing"];
      const result = await executeSaga(
        saga,
        {
          company: "COMP-001",
          fiscalYear: 2026,
          period: 12,
          periodType: "fiscal_year",
        },
      );

      assert.equal(result.status, "hitl_waiting");
      assert.ok(result.hitlCheckpoint);
      assert.equal(result.hitlCheckpoint?.stepId, "lock-accounting-period");
      assert.ok(result.hitlCheckpoint?.reason.includes("CFO"));
    });
  });
});
