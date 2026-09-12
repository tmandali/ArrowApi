export { StockDashboard } from "./components/StockDashboard";
export { StockPageForm } from "./components/StockPageForm";
export { stockWorkspace } from "./workspace.config";
export { stockNav, stockDashboardPath } from "./routes";

// Public Forms & Views
export {
  StockBalanceForm,
  stockBalanceCriteriaSchema,
} from "./stock-balance";
export {
  StockAnalyticsForm,
  stockAnalyticsCriteriaSchema,
} from "./stock-analytics";
export {
  RetailSalesForm,
  retailSalesCriteriaSchema,
} from "./retail-sales-report";
export { StockLedgerForm } from "./stock-ledger";
export { ItemFormShell } from "./item";

/**
 * Yula plug-and-play report registration: kart + slash komut manifest'i
 * Public API üzerinden shell'e verilir (shell workspace içine bakmaz).
 */
export { stockReportCards, stockReportCardKinds } from "./report-cards";
export { default as stockReportAgentYaml } from "./agents/report.agent.yaml";
