import { defineBoundedContext } from "@/lib/contracts/bounded-context";
import { supplierLedgerState, type SupplierLedgerFilterState } from "./supplier-ledger.state";

/**
 * 1:1 Bounded Context definition for Supplier Ledger Report Menu Item.
 * 
 * Formula: Bounded Context = Bounded State + Bounded Process (Analytical Context - CQRS Read Model)
 */
export const supplierLedgerContext = defineBoundedContext<SupplierLedgerFilterState>({
  id: "supplier_ledger",
  title: "Tedarikçi Cari Ekstresi Raporu",
  workspace: "accounting",
  type: "analytical",
  partyReferenceKey: "supplier",
  state: supplierLedgerState,
  process: undefined,
  screen: {
    screenId: "supplier_ledger",
    screenTitle: "Tedarikçi Cari Ekstresi",
    workspace: "accounting",
    category: "report_results",
    aiEnabled: true,
    actions: {},
  },
});

export type SupplierLedgerContext = typeof supplierLedgerContext;
