import { defineBoundedContext } from "@/lib/contracts/bounded-context";
import { retailSalesState, type RetailSalesFilterState } from "./retail-sales.state";

/**
 * 1:1 Bounded Context definition for Retail Sales Report Menu Item.
 * 
 * Formula: Bounded Context = Bounded State + Bounded Process (Analytical Context - CQRS Read Model)
 */
export const retailSalesContext = defineBoundedContext<RetailSalesFilterState>({
  id: "retail_sales_report",
  title: "Perakende Satış Raporu",
  workspace: "stock",
  type: "analytical",
  state: retailSalesState,
  process: undefined,
  screen: {
    screenId: "retail_sales_report",
    screenTitle: "Perakende Satış Raporu",
    workspace: "stock",
    category: "report_results",
    aiEnabled: true,
    actions: {},
  },
});

export type RetailSalesContext = typeof retailSalesContext;
