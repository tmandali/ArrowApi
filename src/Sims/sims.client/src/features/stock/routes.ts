import type { WorkspaceRouteConfig } from "@/lib/workspace-route"
import StockPage from "@/pages/StockPage"
import SerialBatchTraceabilityPage from "@/pages/SerialBatchTraceabilityPage"
import ItemPage from "@/pages/ItemPage"
import StockAnalyticsPage from "@/pages/StockAnalyticsPage"
import StockLedgerPage from "@/pages/StockLedgerPage"
import StockBalancePage from "@/pages/StockBalancePage"

export const stockRoutes: WorkspaceRouteConfig[] = [
  {
    path: "stock/dashboard",
    Component: StockPage,
  },
  {
    path: "stock/serial-batch-traceability",
    Component: SerialBatchTraceabilityPage,
  },
  {
    path: "stock/item",
    Component: ItemPage,
  },
  {
    path: "stock/stock-analytics",
    Component: StockAnalyticsPage,
    fullHeight: true,
  },
  {
    path: "stock/stock-analytics/:jobId",
    Component: StockAnalyticsPage,
    fullHeight: true,
  },
  {
    path: "stock/stock-ledger",
    Component: StockLedgerPage,
    fullHeight: true,
  },
  {
    path: "stock/stock-balance",
    Component: StockBalancePage,
    fullHeight: true,
  },
  {
    path: "stock/stock-balance/:jobId",
    Component: StockBalancePage,
    fullHeight: true,
  },
]
