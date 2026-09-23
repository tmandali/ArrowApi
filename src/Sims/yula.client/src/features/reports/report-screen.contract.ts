import { z } from "zod";
import { defineScreenContract } from "@/lib/contracts/screen-contract";

export const ReportCriteriaRunInputSchema = z.object({
  criteria: z.record(z.string(), z.any()).optional(),
});

export const ReportWasmSqlInputSchema = z.object({
  sql: z.string(),
});

const commonReportActions = {
  RUN_REPORT: {
    description: "Executes the report job with given filter criteria ({ criteria?: Record<string, any> }).",
    inputSchema: ReportCriteriaRunInputSchema,
    whenToCall: "When the user commands to run or re-run the report with parameters.",
    whenNotToCall: "When querying results via SQL or exporting.",
  },
  RESET_CRITERIA: {
    description: "Clears current criteria form inputs and resets to default values.",
    whenToCall: "When the user asks to reset or clear criteria fields.",
    whenNotToCall: "When running the report.",
  },
  EXECUTE_SQL: {
    description: "Runs an analytical SQL query against the in-memory DuckDB table of the current report results.",
    inputSchema: ReportWasmSqlInputSchema,
    whenToCall: "When the user asks analytical, aggregate, grouping, or calculation questions about the loaded report data.",
    whenNotToCall: "When on a non-report screen or when no results are loaded.",
  },
};

export const StockBalanceReportContract = defineScreenContract({
  screenId: "report:stock-balance",
  screenTitle: "Stok Bakiye Raporu",
  workspace: "stock",
  category: "report_results",
  aiEnabled: true,
  actions: commonReportActions,
});

export const StockAnalyticsReportContract = defineScreenContract({
  screenId: "report:stock-analytics",
  screenTitle: "Stok Analitiği Raporu",
  workspace: "stock",
  category: "report_results",
  aiEnabled: true,
  actions: commonReportActions,
});

export const RetailSalesReportContract = defineScreenContract({
  screenId: "report:retail-sales-report",
  screenTitle: "Perakende Satış Raporu",
  workspace: "stock",
  category: "report_results",
  aiEnabled: true,
  actions: commonReportActions,
});

export const StockLedgerReportContract = defineScreenContract({
  screenId: "report:stock-ledger",
  screenTitle: "Stok Hareket Raporu (Ledger)",
  workspace: "stock",
  category: "report_results",
  aiEnabled: true,
  actions: commonReportActions,
});
