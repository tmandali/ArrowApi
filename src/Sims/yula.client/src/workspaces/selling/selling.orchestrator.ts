/**
 * Selling Workspace Orchestrator
 * 
 * Houses specialized Sagas for the Selling domain:
 * 1. domesticOrderToInvoice: Standard Domestic Order-to-Invoice pipeline
 * 2. exportOrderFulfillment: Cross-border Export & Customs pipeline
 */

import {
  defineSagaOrchestrator,
  type SagaOrchestrator,
  type SagaExecutionContext,
} from "../../lib/contracts/workflow-orchestrator";
import { registerOrchestrator } from "../../lib/orchestration/saga-registry";

export const sellingOrchestrator: SagaOrchestrator = defineSagaOrchestrator({
  id: "selling-workspace-orchestrator",
  name: "Selling Domain Orchestrator",
  workspace: "selling",
  sagas: {
    "selling:domestic-order-to-invoice": {
      id: "selling:domestic-order-to-invoice",
      name: "Domestic Order to Invoice",
      nameKey: "BoundedContext.Selling.Saga.domestic_order_title",
      workspace: "selling",
      description: "Sequentially approves sales order, creates delivery note, and issues sales invoice.",
      descriptionKey: "BoundedContext.Selling.Saga.domestic_order_desc",
      compensatingPolicy: "rollback_all",
      steps: [
        {
          id: "approve-sales-order",
          name: "Approve Sales Order",
          contextId: "selling/sales-order",
          action: "approve",
          handler: async (payload: { orderId: string; totalAmount?: number }, _ctx: SagaExecutionContext) => {
            return {
              orderId: payload.orderId,
              customerId: "CUST-001",
              status: "Approved",
              totalAmount: payload.totalAmount ?? 25000,
              approvedAt: new Date().toISOString(),
            };
          },
          compensate: async (output: any) => {
            // Rollback: Revert order status back to PendingApproval
            return { revertedOrderId: output.orderId, newStatus: "PendingApproval" };
          },
        },
        {
          id: "create-delivery-note",
          name: "Create Delivery Note",
          contextId: "stock/delivery-note",
          action: "createFromOrder",
          payloadTransform: (prevResult: any) => ({
            orderId: prevResult.orderId,
            customerId: prevResult.customerId,
            totalAmount: prevResult.totalAmount,
            dispatchDate: new Date().toISOString(),
          }),
          handler: async (payload: any) => {
            return {
              deliveryNoteId: `DN-${payload.orderId}`,
              orderId: payload.orderId,
              status: "Dispatched",
              dispatchedAt: payload.dispatchDate,
            };
          },
          compensate: async (output: any) => {
            // Rollback: Cancel the created delivery note
            return { canceledDeliveryNoteId: output.deliveryNoteId, status: "Canceled" };
          },
        },
        {
          id: "create-and-sign-invoice",
          name: "Create & Sign Sales Invoice",
          contextId: "selling/sales-invoice",
          action: "createAndSign",
          payloadTransform: (prevResult: any, state: Record<string, any>) => ({
            deliveryNoteId: prevResult.deliveryNoteId,
            orderId: prevResult.orderId ?? (state["approve-sales-order"] as any)?.orderId,
            totalAmount: (state["approve-sales-order"] as any)?.totalAmount ?? 0,
          }),
          hitlCheck: (output: any, state: Record<string, any>) => {
            const amount = (state["approve-sales-order"] as any)?.totalAmount ?? 0;
            if (amount > 100_000) {
              return {
                requiresHitl: true,
                reason: `Invoice total exceeds HITL threshold (${amount} > 100,000)`,
                prompt: `High-value invoice detected (${amount} TL). Please confirm to proceed with tax authority signing.`,
              };
            }
            return null;
          },
          handler: async (payload: any) => {
            return {
              invoiceId: `INV-${payload.orderId}`,
              deliveryNoteId: payload.deliveryNoteId,
              status: "SignedAndPosted",
              signedAt: new Date().toISOString(),
            };
          },
          compensate: async (output: any) => {
            // Rollback: Void the sales invoice
            return { voidedInvoiceId: output.invoiceId, status: "Voided" };
          },
        },
      ],
      strategies: {
        TR: {
          countryCode: "TR",
          description: "Turkey e-Transformation Strategy with GİB E-İrsaliye signing",
          additionalSteps: [
            {
              insertAfter: "create-delivery-note",
              step: {
                id: "gib-sign-delivery-note",
                name: "GİB E-İrsaliye Gönder & İmzala",
                contextId: "stock/delivery-note",
                action: "gibSignAndSend",
                payloadTransform: (prev: any) => ({
                  deliveryNoteId: prev.deliveryNoteId,
                  orderId: prev.orderId,
                }),
                handler: async (payload: any) => ({
                  deliveryNoteId: payload.deliveryNoteId,
                  orderId: payload.orderId,
                  gibUuid: `GIB-UUID-${payload.orderId}`,
                  gibStatusCode: "1220",
                  gibSigned: true,
                }),
                compensate: async (output: any) => ({
                  canceledGibUuid: output.gibUuid,
                  gibCanceled: true,
                }),
              },
            },
          ],
        },
        DE: {
          countryCode: "DE",
          description: "Germany GoBD Compliance Strategy with VIES VAT check",
          additionalSteps: [
            {
              insertBefore: "create-and-sign-invoice",
              step: {
                id: "vies-vat-validation",
                name: "VIES AB KDV Numarası Doğrulama",
                contextId: "selling/sales-invoice",
                action: "validateVies",
                payloadTransform: (prev: any, state: any) => ({
                  orderId: state["approve-sales-order"]?.orderId,
                  vatNumber: "DE123456789",
                }),
                handler: async (payload: any) => ({
                  orderId: payload.orderId,
                  viesValid: true,
                  viesToken: `VIES-TOKEN-${payload.orderId}`,
                }),
                compensate: async (output: any) => ({
                  voidedViesToken: output.viesToken,
                }),
              },
            },
          ],
        },
      },
    },
    "selling:export-order": {
      id: "selling:export-order",
      name: "Export Order Fulfillment",
      workspace: "selling",
      description: "Full export pipeline: sales order approval, customs declaration, and tax-exempt export invoice.",
      compensatingPolicy: "rollback_all",
      steps: [
        {
          id: "approve-export-order",
          name: "Approve Export Order",
          contextId: "selling/sales-order",
          action: "approve",
          handler: async (payload: { orderId: string }) => ({
            orderId: payload.orderId,
            exportCountry: "DE",
            status: "Approved",
          }),
          compensate: async (output: any) => ({ revertedOrderId: output.orderId }),
        },
        {
          id: "customs-declaration",
          name: "Generate Customs Declaration",
          contextId: "customs/declaration",
          action: "generateDeclaration",
          payloadTransform: (prev: any) => ({ orderId: prev.orderId, country: prev.exportCountry }),
          handler: async (payload: any) => ({
            declarationId: `CUST-DEC-${payload.orderId}`,
            customsStatus: "Cleared",
          }),
          compensate: async (output: any) => ({ canceledDeclarationId: output.declarationId }),
        },
        {
          id: "export-invoice",
          name: "Issue Export Tax-Exempt Invoice",
          contextId: "selling/sales-invoice",
          action: "issueExportInvoice",
          payloadTransform: (prev: any, state: any) => ({
            declarationId: prev.declarationId,
            orderId: state["approve-export-order"]?.orderId,
          }),
          handler: async (payload: any) => ({
            exportInvoiceId: `EXP-INV-${payload.orderId}`,
            vatExempt: true,
            status: "Posted",
          }),
          compensate: async (output: any) => ({ voidedExportInvoiceId: output.exportInvoiceId }),
        },
      ],
    },
  },
});

// Auto-register in central registry
registerOrchestrator(sellingOrchestrator);
