import { defineBoundedContext } from "@/lib/contracts/bounded-context";
import { stockAnalyticsState, type StockAnalyticsFilterState } from "./stock-analytics.state";

/**
 * 1:1 Bounded Context definition for Stock Analytics Report Menu Item.
 * 
 * Formula: Bounded Context = Bounded State + Bounded Process (Analytical Context - CQRS Read Model)
 */
export const stockAnalyticsContext = defineBoundedContext<StockAnalyticsFilterState>({
  id: "stock_analytics",
  title: "Stok Analitik & Trend Raporu",
  workspace: "stock",
  type: "analytical",
  state: stockAnalyticsState,
  process: undefined,
  screen: {
    screenId: "stock_analytics",
    screenTitle: "Stok Analitik Raporu",
    workspace: "stock",
    category: "report_results",
    aiEnabled: true,
    actions: {},
  },
});

export type StockAnalyticsContext = typeof stockAnalyticsContext;
