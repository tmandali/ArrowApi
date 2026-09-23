import { defineBoundedContext } from "@/lib/contracts/bounded-context";
import { stockLedgerState, type StockLedgerFilterState } from "./stock-ledger.state";

/**
 * 1:1 Bounded Context definition for Stock Ledger Report Menu Item.
 * 
 * Formula: Bounded Context = Bounded State + Bounded Process (Analytical Context - CQRS Read Model)
 */
export const stockLedgerContext = defineBoundedContext<StockLedgerFilterState>({
  id: "stock_ledger",
  title: "Stok Ekstresi (Ledger) Raporu",
  workspace: "stock",
  type: "analytical",
  state: stockLedgerState,
  process: undefined,
  screen: {
    screenId: "stock_ledger",
    screenTitle: "Stok Ekstresi Raporu",
    workspace: "stock",
    category: "report_results",
    aiEnabled: true,
    actions: {},
  },
});

export type StockLedgerContext = typeof stockLedgerContext;
