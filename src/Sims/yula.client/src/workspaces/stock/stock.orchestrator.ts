/**
 * Stock Workspace Orchestrator
 * 
 * Houses specialized Sagas for the Stock & Inventory domain:
 * 1. interWarehouseTransfer: Inter-warehouse transfer with source dispatch and target receipt
 * 2. inventoryReconciliation: Physical inventory count and discrepancy adjustment with HITL gate
 */

import {
  defineSagaOrchestrator,
  type SagaOrchestrator,
} from "../../lib/contracts/workflow-orchestrator";
import { registerOrchestrator } from "../../lib/orchestration/saga-registry";

export const stockOrchestrator: SagaOrchestrator = defineSagaOrchestrator({
  id: "stock-workspace-orchestrator",
  name: "Stock Domain Orchestrator",
  workspace: "stock",
  sagas: {
    "stock:inter-warehouse-transfer": {
      id: "stock:inter-warehouse-transfer",
      name: "Inter-Warehouse Stock Transfer",
      nameKey: "BoundedContext.Stock.Saga.transfer_title",
      workspace: "stock",
      description: "Coordinates inter-warehouse inventory transfer: dispatches from source and admits into destination.",
      descriptionKey: "BoundedContext.Stock.Saga.transfer_desc",
      compensatingPolicy: "rollback_all",
      steps: [
        {
          id: "issue-transfer-dispatch",
          name: "Issue Transfer Delivery Note",
          contextId: "stock/delivery-note",
          action: "dispatch",
          handler: async (payload: { fromWarehouse: string; toWarehouse: string; itemCode: string; qty: number }) => {
            return {
              transferId: `TRF-${Date.now()}`,
              fromWarehouse: payload.fromWarehouse,
              toWarehouse: payload.toWarehouse,
              itemCode: payload.itemCode,
              qty: payload.qty,
              status: "DispatchedFromSource",
              dispatchedAt: new Date().toISOString(),
            };
          },
          compensate: async (output: any) => {
            return { revertedTransferId: output.transferId, status: "RevertedToSource" };
          },
        },
        {
          id: "admit-target-receipt",
          name: "Admit Goods at Destination Warehouse",
          contextId: "stock/stock-entry",
          action: "receive",
          payloadTransform: (prevResult: any, state: Record<string, any>) => {
            const dispatch = (state["issue-transfer-dispatch"] as any) || {};
            return {
              transferId: prevResult.transferId ?? dispatch.transferId,
              toWarehouse: prevResult.toWarehouse ?? dispatch.toWarehouse,
              itemCode: prevResult.itemCode ?? dispatch.itemCode,
              qty: prevResult.qty ?? dispatch.qty,
            };
          },
          handler: async (payload: any) => {
            return {
              transferId: payload.transferId,
              targetWarehouse: payload.toWarehouse,
              admittedQty: payload.qty,
              status: "CompletedAndAdmitted",
              receivedAt: new Date().toISOString(),
            };
          },
          compensate: async (output: any) => {
            return { voidedTransferId: output.transferId, status: "ReceiptVoided" };
          },
        },
      ],
      strategies: {
        TR: {
          countryCode: "TR",
          description: "Turkey Inter-Warehouse E-İrsaliye Compliance Strategy",
          additionalSteps: [
            {
              insertAfter: "issue-transfer-dispatch",
              step: {
                id: "gib-sign-internal-dispatch",
                name: "GİB Dahili E-İrsaliye İmzala",
                contextId: "stock/delivery-note",
                action: "signInternalDispatch",
                payloadTransform: (prev: any) => ({
                  transferId: prev.transferId,
                  fromWarehouse: prev.fromWarehouse,
                  toWarehouse: prev.toWarehouse,
                }),
                handler: async (payload: any) => ({
                  transferId: payload.transferId,
                  gibInternalUuid: `GIB-TRF-UUID-${payload.transferId}`,
                  gibSigned: true,
                }),
                compensate: async (output: any) => ({
                  canceledInternalUuid: output.gibInternalUuid,
                  gibCanceled: true,
                }),
              },
            },
          ],
        },
        DE: {
          countryCode: "DE",
          description: "Germany GoBD Internal Transfer Protocol Strategy",
          additionalSteps: [
            {
              insertBefore: "admit-target-receipt",
              step: {
                id: "gobd-transfer-hash",
                name: "GoBD Interner Umlagerungsbeleg",
                contextId: "stock/stock-entry",
                action: "generateGobdHash",
                payloadTransform: (prev: any) => ({
                  transferId: prev.transferId,
                }),
                handler: async (payload: any) => ({
                  transferId: payload.transferId,
                  gobdHash: `GOBD-SHA256-${payload.transferId}`,
                  auditVerified: true,
                }),
              },
            },
          ],
        },
      },
    },
    "stock:inventory-reconciliation": {
      id: "stock:inventory-reconciliation",
      name: "Inventory Count Reconciliation",
      nameKey: "BoundedContext.Stock.Saga.reconcile_title",
      workspace: "stock",
      description: "Audits physical count against system book balance and posts valuation adjustments.",
      descriptionKey: "BoundedContext.Stock.Saga.reconcile_desc",
      compensatingPolicy: "rollback_all",
      steps: [
        {
          id: "submit-physical-count",
          name: "Submit Physical Count",
          contextId: "stock/stock-reconciliation",
          action: "submitCount",
          handler: async (payload: { warehouse: string; itemCode: string; physicalQty: number; systemQty: number; unitCost: number }) => {
            const discrepancyQty = payload.physicalQty - payload.systemQty;
            const discrepancyAmount = Math.abs(discrepancyQty * payload.unitCost);
            return {
              countBatchId: `COUNT-${Date.now()}`,
              warehouse: payload.warehouse,
              itemCode: payload.itemCode,
              discrepancyQty,
              discrepancyAmount,
              status: "CountAudited",
            };
          },
          compensate: async (output: any) => ({ revertedCountBatchId: output.countBatchId }),
        },
        {
          id: "post-valuation-adjustment",
          name: "Post Stock Valuation Adjustment",
          contextId: "stock/stock-entry",
          action: "postAdjustment",
          payloadTransform: (prevResult: any) => ({
            countBatchId: prevResult.countBatchId,
            warehouse: prevResult.warehouse,
            discrepancyQty: prevResult.discrepancyQty,
            discrepancyAmount: prevResult.discrepancyAmount,
          }),
          hitlCheck: (output: any, state: Record<string, any>) => {
            const discAmount = (state["submit-physical-count"] as any)?.discrepancyAmount ?? 0;
            if (discAmount > 50_000) {
              return {
                requiresHitl: true,
                reason: `Stok fark tutarı eşik değerini aşıyor (${discAmount} TL > 50,000 TL).`,
                prompt: `Yüksek tutarlı stok sayım farkı tespit edildi (${discAmount} TL). Düzeltme kaydını onaylıyor musunuz?`,
              };
            }
            return null;
          },
          handler: async (payload: any) => {
            return {
              adjustmentVoucherId: `ADJ-${payload.countBatchId}`,
              adjustedQty: payload.discrepancyQty,
              status: "AdjustmentPosted",
              adjustedAt: new Date().toISOString(),
            };
          },
          compensate: async (output: any) => ({ voidedAdjustmentId: output.adjustmentVoucherId }),
        },
      ],
    },
  },
});

registerOrchestrator(stockOrchestrator);
