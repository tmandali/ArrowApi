import { defineBoundedContext } from "@/lib/contracts/bounded-context";
import { stockBalanceState, type StockBalanceFilterState } from "./stock-balance.state";

/**
 * 1:1 Bounded Context definition for Stock Balance Report Menu Item.
 * 
 * Formula: Bounded Context = Bounded State + Bounded Process (Analytical Context - CQRS Read Model)
 */
export const stockBalanceContext = defineBoundedContext<StockBalanceFilterState>({
  id: "stock_balance",
  title: "Stok Bakiye Raporu",
  workspace: "stock",
  type: "analytical",
  state: stockBalanceState,
  process: undefined, // Analytical reports have no transactional workflow/lifecycle
  screen: {
    screenId: "stock_balance",
    screenTitle: "Stok Bakiye Raporu",
    workspace: "stock",
    category: "report_results",
    aiEnabled: true,
    actions: {},
  },
});

export type StockBalanceContext = typeof stockBalanceContext;
