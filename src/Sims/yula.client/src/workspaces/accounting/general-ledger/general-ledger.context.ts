import { defineBoundedContext } from "@/lib/contracts/bounded-context";
import { generalLedgerState, type GeneralLedgerFilterState } from "./general-ledger.state";

/**
 * 1:1 Bounded Context definition for General Ledger Report Menu Item.
 * 
 * Formula: Bounded Context = Bounded State + Bounded Process (Analytical Context - CQRS Read Model)
 */
export const generalLedgerContext = defineBoundedContext<GeneralLedgerFilterState>({
  id: "general_ledger",
  title: "Büyük Defter (Genel Muavin) Raporu",
  workspace: "accounting",
  type: "analytical",
  state: generalLedgerState,
  process: undefined,
  screen: {
    screenId: "general_ledger",
    screenTitle: "Genel Muavin Defteri",
    workspace: "accounting",
    category: "report_results",
    aiEnabled: true,
    actions: {},
  },
});

export type GeneralLedgerContext = typeof generalLedgerContext;
