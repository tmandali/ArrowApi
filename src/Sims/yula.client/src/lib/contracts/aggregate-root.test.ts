import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  validateAggregateInvariants,
  formatAggregateRootPrompt,
} from "./aggregate-root";
import {
  salesOrderAggregate,
  salesOrderState,
} from "../../workspaces/selling/sales-order/sales-order.state";

describe("Aggregate Root & Invariant Validation Engine", () => {
  it("validates that a consistent aggregate passes invariant checks", () => {
    const validOrder = {
      order_no: "SO-100",
      customer_id: "CUST-A",
      order_date: "2026-09-24",
      grand_total: 500,
      currency: "TRY",
      status: "Draft",
    };

    const validLines = {
      items: [
        { item_code: "ITEM-1", qty: 2, rate: 150, amount: 300 },
        { item_code: "ITEM-2", qty: 1, rate: 200, amount: 200 },
      ],
    };

    const result = validateAggregateInvariants(salesOrderAggregate, validOrder, validLines);
    assert.equal(result.valid, true);
    assert.equal(result.errors.length, 0);
  });

  it("detects invariant violation when grand total does not match line amounts sum", () => {
    const invalidOrder = {
      order_no: "SO-101",
      customer_id: "CUST-B",
      order_date: "2026-09-24",
      grand_total: 999, // Inconsistent with lines (300 + 200 = 500)
      currency: "TRY",
      status: "Draft",
    };

    const lines = {
      items: [
        { item_code: "ITEM-1", qty: 2, rate: 150, amount: 300 },
        { item_code: "ITEM-2", qty: 1, rate: 200, amount: 200 },
      ],
    };

    const result = validateAggregateInvariants(salesOrderAggregate, invalidOrder, lines);
    assert.equal(result.valid, false);
    assert.equal(result.errors.length, 1);
    assert.match(result.errors[0], /Grand total \(999\) does not match the sum of item amounts \(500\)/);
  });

  it("enforces child collection cardinality (minCount: 1)", () => {
    const emptyOrder = {
      order_no: "SO-EMPTY",
      customer_id: "CUST-C",
      order_date: "2026-09-24",
      grand_total: 0,
      currency: "TRY",
      status: "Draft",
    };

    const emptyLines = {
      items: [], // Violates minCount: 1
    };

    const result = validateAggregateInvariants(salesOrderAggregate, emptyOrder, emptyLines);
    assert.equal(result.valid, false);
    assert.ok(
      result.errors.some((err) =>
        err.includes("requires at least 1 item(s), but found 0"),
      ),
    );
  });

  it("formats Aggregate Root into structured LLM Markdown guidelines", () => {
    const prompt = formatAggregateRootPrompt(salesOrderAggregate);

    assert.match(prompt, /Aggregate Root: SalesOrder/);
    assert.match(prompt, /👑 Root Entity \(Header\):/);
    assert.match(prompt, /- `order_no` \[string\]: Unique Sales Order identifier/);
    assert.match(prompt, /📋 Child Collections \(Lines \/ Details\):/);
    assert.match(prompt, /\*\*`items`\*\* -> `SalesOrderItem` \(min: 1\)/);
    assert.match(prompt, /🛡️ Invariant Rules \(Consistency Constraints\):/);
    assert.match(prompt, /\[grand-total-sum-consistency\]/);
  });

  it("converts cleanly into BoundedStateDefinition with invariant rules populated", () => {
    assert.equal(salesOrderState.entityName, "SalesOrder");
    assert.ok(salesOrderState.fields?.order_no);
    assert.ok(salesOrderState.aggregateRoot);
    assert.ok(
      salesOrderState.businessRules?.some((r) =>
        r.includes("[Invariant grand-total-sum-consistency]"),
      ),
    );
  });
});
