/**
 * Enterprise Cross-Workspace Orchestrator: Order-to-Cash (O2C)
 * 
 * Coordinates multi-workspace value stream:
 * 1. selling (Sales Order)
 * 2. stock (Inventory Allocation & Dispatch)
 * 3. accounting (General Ledger & Accounts Receivable)
 */

import {
  defineSagaOrchestrator,
  type SagaOrchestrator,
} from "../lib/contracts/workflow-orchestrator";
import { registerOrchestrator } from "../lib/orchestration/saga-registry";

export const orderToCashOrchestrator: SagaOrchestrator = defineSagaOrchestrator({
  id: "global-order-to-cash-orchestrator",
  name: "Enterprise Order-to-Cash Orchestrator",
  workspace: "cross-workspace",
  sagas: {
    "global:order-to-cash": {
      id: "global:order-to-cash",
      name: "Global Order-to-Cash Value Stream",
      workspace: "cross-workspace",
      description: "Coordinates order approval (selling), stock allocation and fulfillment (stock), and accounts receivable posting (accounting).",
      compensatingPolicy: "rollback_all",
      steps: [
        {
          id: "step-1-sales-order",
          name: "Confirm Sales Order",
          contextId: "selling/sales-order",
          action: "confirm",
          handler: async (payload: { orderId: string; customerId: string; amount: number }) => ({
            orderId: payload.orderId,
            customerId: payload.customerId,
            amount: payload.amount,
            status: "Confirmed",
          }),
          compensate: async (output: any) => ({
            revertedOrderId: output.orderId,
            status: "Draft",
          }),
        },
        {
          id: "step-2-stock-fulfillment",
          name: "Allocate & Dispatch Stock",
          contextId: "stock/delivery-note",
          action: "allocateAndDispatch",
          payloadTransform: (prev: any) => ({
            orderId: prev.orderId,
            warehouse: "MAIN-WH",
          }),
          handler: async (payload: any) => ({
            shipmentId: `SHIP-${payload.orderId}`,
            warehouse: payload.warehouse,
            dispatched: true,
          }),
          compensate: async (output: any) => ({
            revertedShipmentId: output.shipmentId,
            stockReleased: true,
          }),
        },
        {
          id: "step-3-ar-posting",
          name: "Post to Accounts Receivable Ledger",
          contextId: "accounting/general-ledger",
          action: "postArEntry",
          payloadTransform: (prev: any, state: any) => ({
            orderId: state["step-1-sales-order"]?.orderId,
            shipmentId: prev.shipmentId,
            amount: state["step-1-sales-order"]?.amount,
          }),
          handler: async (payload: any) => ({
            ledgerEntryId: `GL-AR-${payload.orderId}`,
            posted: true,
          }),
          compensate: async (output: any) => ({
            voidedLedgerEntryId: output.ledgerEntryId,
            postedReverseEntry: true,
          }),
        },
      ],
    },
  },
});

// Auto-register in central registry
registerOrchestrator(orderToCashOrchestrator);
