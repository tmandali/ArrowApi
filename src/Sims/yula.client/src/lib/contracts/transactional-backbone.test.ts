import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  salesOrderContext,
  salesOrderAggregate,
} from "../../workspaces/selling/sales-order";
import {
  salesInvoiceContext,
  salesInvoiceAggregate,
} from "../../workspaces/selling/sales-invoice";
import {
  deliveryNoteContext,
  deliveryNoteAggregate,
} from "../../workspaces/stock/delivery-note";
import {
  resolveContextStrategy,
  validateTransition,
  canTransition,
} from "./bounded-context";
import { validateAggregateInvariants } from "./aggregate-root";
import { executeSaga } from "./workflow-orchestrator";
import { sellingOrchestrator } from "../../workspaces/selling/selling.orchestrator";

describe("Transactional Backbone: Sales Order -> Delivery Note -> Sales Invoice", () => {
  describe("1. Sales Order Bounded Context & Aggregate Invariants", () => {
    it("validates sales order invariants (grand_total equals sum of line amounts)", () => {
      const valid = validateAggregateInvariants(
        salesOrderAggregate,
        {
          order_no: "SO-2026-001",
          customer_id: "CUST-TR-01",
          order_date: "2026-09-24",
          grand_total: 300,
          currency: "TRY",
          status: "Draft",
        },
        {
          items: [
            { item_code: "ITEM-A", qty: 2, rate: 100, amount: 200 },
            { item_code: "ITEM-B", qty: 1, rate: 100, amount: 100 },
          ],
        },
      );
      assert.equal(valid.valid, true);

      const invalid = validateAggregateInvariants(
        salesOrderAggregate,
        {
          order_no: "SO-2026-001",
          customer_id: "CUST-TR-01",
          order_date: "2026-09-24",
          grand_total: 500, // mismatch
          currency: "TRY",
          status: "Draft",
        },
        {
          items: [
            { item_code: "ITEM-A", qty: 2, rate: 100, amount: 200 },
            { item_code: "ITEM-B", qty: 1, rate: 100, amount: 100 },
          ],
        },
      );
      assert.equal(invalid.valid, false);
      assert.ok(invalid.errors[0].includes("Grand total (500) does not match the sum of item amounts (300)"));
    });

    it("resolves TR and DE strategies cleanly on sales order", () => {
      const trContext = resolveContextStrategy(salesOrderContext, "TR");
      assert.ok(trContext.state.fields?.e_invoice_profile);
      assert.ok(trContext.state.fields?.tax_id);

      const deContext = resolveContextStrategy(salesOrderContext, "DE");
      assert.ok(deContext.state.fields?.ust_idnr);
      assert.ok(deContext.state.fields?.leitweg_id);
    });

    it("enforces sales order process state machine transitions", () => {
      const proc = salesOrderContext.process!;
      assert.equal(canTransition(proc, "Draft", "PendingApproval"), true);
      assert.equal(canTransition(proc, "PendingApproval", "Approved"), true);
      assert.equal(canTransition(proc, "Approved", "Dispatched"), true);
      assert.equal(canTransition(proc, "Draft", "Dispatched"), false);

      const invalidResult = validateTransition(proc, "Draft", "Dispatched");
      assert.equal(invalidResult.valid, false);
      assert.ok(invalidResult.error?.includes("Geçersiz durum geçişi"));
    });
  });

  describe("2. Delivery Note Bounded Context & Aggregate Invariants", () => {
    it("validates delivery note invariants (total_qty equals sum of items)", () => {
      const valid = validateAggregateInvariants(
        deliveryNoteAggregate,
        {
          delivery_note_no: "DN-2026-001",
          customer_id: "CUST-01",
          dispatch_date: "2026-09-24",
          warehouse_id: "WH-MAIN",
          total_qty: 15,
          status: "Draft",
        },
        {
          items: [
            { item_code: "IT-01", qty: 10, uom: "ADET", warehouse_id: "WH-MAIN" },
            { item_code: "IT-02", qty: 5, uom: "ADET", warehouse_id: "WH-MAIN" },
          ],
        },
      );
      assert.equal(valid.valid, true);

      const invalidQty = validateAggregateInvariants(
        deliveryNoteAggregate,
        {
          delivery_note_no: "DN-2026-001",
          customer_id: "CUST-01",
          dispatch_date: "2026-09-24",
          warehouse_id: "WH-MAIN",
          total_qty: 20, // mismatch
          status: "Draft",
        },
        {
          items: [
            { item_code: "IT-01", qty: 10, uom: "ADET", warehouse_id: "WH-MAIN" },
            { item_code: "IT-02", qty: 5, uom: "ADET", warehouse_id: "WH-MAIN" },
          ],
        },
      );
      assert.equal(invalidQty.valid, false);
      assert.ok(invalidQty.errors[0].includes("does not match sum of items"));
    });

    it("resolves TR e-İrsaliye fields and DE Lieferschein fields", () => {
      const trContext = resolveContextStrategy(deliveryNoteContext, "TR");
      assert.ok(trContext.state.fields?.gib_uuid);
      assert.ok(trContext.state.fields?.plate_number);

      const deContext = resolveContextStrategy(deliveryNoteContext, "DE");
      assert.ok(deContext.state.fields?.lieferschein_nr);
      assert.ok(deContext.state.fields?.frachtbrief_nr);
    });

    it("enforces delivery note lifecycle transitions", () => {
      const proc = deliveryNoteContext.process!;
      assert.equal(canTransition(proc, "Draft", "Dispatched"), true);
      assert.equal(canTransition(proc, "Dispatched", "Invoiced"), true);
      assert.equal(canTransition(proc, "Draft", "Invoiced"), false);
    });
  });

  describe("3. Sales Invoice Bounded Context & Aggregate Invariants", () => {
    it("validates sales invoice mathematical consistency invariants", () => {
      const valid = validateAggregateInvariants(
        salesInvoiceAggregate,
        {
          invoice_no: "INV-2026-001",
          customer_id: "CUST-01",
          invoice_date: "2026-09-24",
          subtotal: 1000,
          tax_total: 200,
          grand_total: 1200,
          currency: "TRY",
          status: "Draft",
        },
        {
          items: [
            { item_code: "IT-01", qty: 5, rate: 200, amount: 1000, vat_rate: 20, vat_amount: 200 },
          ],
          tax_breakdown: [
            { tax_type: "KDV20", tax_rate: 20, taxable_amount: 1000, tax_amount: 200 },
          ],
        },
      );
      assert.equal(valid.valid, true);

      const invalidGrand = validateAggregateInvariants(
        salesInvoiceAggregate,
        {
          invoice_no: "INV-2026-001",
          customer_id: "CUST-01",
          invoice_date: "2026-09-24",
          subtotal: 1000,
          tax_total: 200,
          grand_total: 1500, // mismatch
          currency: "TRY",
          status: "Draft",
        },
        {
          items: [
            { item_code: "IT-01", qty: 5, rate: 200, amount: 1000, vat_rate: 20, vat_amount: 200 },
          ],
          tax_breakdown: [],
        },
      );
      assert.equal(invalidGrand.valid, false);
      assert.ok(invalidGrand.errors[0].includes("Invoice grand_total (1500) does not equal subtotal"));
    });

    it("resolves TR GİB e-Fatura and DE XRechnung strategies", () => {
      const tr = resolveContextStrategy(salesInvoiceContext, "TR");
      assert.ok(tr.state.fields?.gib_uuid);
      assert.ok(tr.state.fields?.tevkifat_kodu);

      const de = resolveContextStrategy(salesInvoiceContext, "DE");
      assert.ok(de.state.fields?.leitweg_id);
      assert.ok(de.state.fields?.xrechnung_version);
    });

    it("enforces sales invoice lifecycle transitions", () => {
      const proc = salesInvoiceContext.process!;
      assert.equal(canTransition(proc, "Draft", "Signed"), true);
      assert.equal(canTransition(proc, "Signed", "Posted"), true);
      assert.equal(canTransition(proc, "Posted", "Paid"), true);
      assert.equal(canTransition(proc, "Draft", "Paid"), false);
    });
  });

  describe("4. End-to-End Orchestrator Pipeline with Country Strategies", () => {
    it("executes selling:domestic-order-to-invoice saga with TR GİB e-İrsaliye injection", async () => {
      const saga = sellingOrchestrator.sagas["selling:domestic-order-to-invoice"];
      const result = await executeSaga(
        saga,
        { orderId: "ORD-999", totalAmount: 45000 },
        {
          countryCode: "TR",
        },
      );

      assert.equal(result.status, "completed");
      assert.equal((result.results["approve-sales-order"] as any)?.status, "Approved");
      assert.equal((result.results["create-delivery-note"] as any)?.deliveryNoteId, "DN-ORD-999");
      assert.equal((result.results["gib-sign-delivery-note"] as any)?.gibSigned, true);
      assert.equal((result.results["create-and-sign-invoice"] as any)?.invoiceId, "INV-ORD-999");
    });

    it("executes selling:domestic-order-to-invoice saga with DE VIES injection", async () => {
      const saga = sellingOrchestrator.sagas["selling:domestic-order-to-invoice"];
      const result = await executeSaga(
        saga,
        { orderId: "ORD-888", totalAmount: 32000 },
        {
          countryCode: "DE",
        },
      );

      assert.equal(result.status, "completed");
      assert.equal((result.results["vies-vat-validation"] as any)?.viesValid, true);
      assert.equal((result.results["create-and-sign-invoice"] as any)?.invoiceId, "INV-ORD-888");
    });
  });
});
