import { defineBoundedContext } from "@/lib/contracts/bounded-context";
import { customerLedgerState, type CustomerLedgerFilterState } from "./customer-ledger.state";

/**
 * 1:1 Bounded Context definition for Customer Ledger Report Menu Item.
 * 
 * Formula: Bounded Context = Bounded State + Bounded Process (Analytical Context - CQRS Read Model)
 */
export const customerLedgerContext = defineBoundedContext<CustomerLedgerFilterState>({
  id: "customer_ledger",
  title: "Müşteri Cari Ekstresi Raporu",
  workspace: "accounting",
  type: "analytical",
  partyReferenceKey: "customer",
  state: customerLedgerState,
  process: undefined,
  screen: {
    screenId: "customer_ledger",
    screenTitle: "Müşteri Cari Ekstresi",
    workspace: "accounting",
    category: "report_results",
    aiEnabled: true,
    actions: {},
  },
});

export type CustomerLedgerContext = typeof customerLedgerContext;
