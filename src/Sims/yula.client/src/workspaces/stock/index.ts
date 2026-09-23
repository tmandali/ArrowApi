export { StockDashboard } from "./components/StockDashboard";
export { StockPageForm } from "./components/StockPageForm";
export { stockWorkspace } from "./workspace.config";
export { stockNav, stockDashboardPath } from "./routes";
export { stockOrchestrator } from "./stock.orchestrator";

// Public Forms & Views
export {
  StockBalanceForm,
  stockBalanceCriteriaSchema,
  stockBalanceContext,
  stockBalanceState,
} from "./stock-balance";
export {
  StockAnalyticsForm,
  stockAnalyticsCriteriaSchema,
  stockAnalyticsContext,
  stockAnalyticsState,
} from "./stock-analytics";
export {
  RetailSalesForm,
  retailSalesCriteriaSchema,
  retailSalesContext,
  retailSalesState,
} from "./retail-sales-report";
export {
  StockLedgerForm,
  stockLedgerContext,
  stockLedgerState,
} from "./stock-ledger";
export { ItemFormShell, itemContext, itemState } from "./item";

/**
 * Yula plug-and-play report registration: kartlar
 * Public API üzerinden shell'e verilir (shell workspace içine bakmaz).
 */
export { stockReportCards, stockReportCardKinds } from "./report-cards";

// Bounded Contexts
export * from "./delivery-note";
