import type { JsonSchemaObject, YulaReportCardConfig } from "@/features/report-criteria";
import { stockBalanceCriteriaSchema } from "./stock-balance";
import { stockAnalyticsCriteriaSchema } from "./stock-analytics";
import { retailSalesCriteriaSchema } from "./retail-sales-report";

/**
 * Stock workspace'in Yula rapor kartları — Public API üzerinden declare
 * edilir; shell (Yula) yalnızca tüketer. Kart ekle/çıkar buradadır.
 * Message part kind formatı AI SDK sözleşmesidir: `{provider}.{type}`.
 */
export const stockReportCardKinds = {
  stockBalance: "yula.report.stock-balance",
  stockAnalytics: "yula.report.stock-analytics",
  retailSales: "yula.report.retail-sales-report",
} as const;

export const stockReportCards: YulaReportCardConfig[] = [
  {
    kind: stockReportCardKinds.stockBalance,
    scope: "stock-balance",
    workspace: "stock",
    title: "Stock Balance",
    description: "Fill in the report criteria below",
    pagePath: "/stock/stock-balance",
    schema: stockBalanceCriteriaSchema as JsonSchemaObject,
  },
  {
    kind: stockReportCardKinds.stockAnalytics,
    scope: "stock-analytics",
    workspace: "stock",
    title: "Stock Analytics",
    description: "Fill in the stock analytics report criteria",
    pagePath: "/stock/stock-analytics",
    schema: stockAnalyticsCriteriaSchema as JsonSchemaObject,
  },
  {
    kind: stockReportCardKinds.retailSales,
    scope: "retail-sales-report",
    workspace: "stock",
    title: "Retail Sales",
    description: "Fill in the retail sales report criteria",
    pagePath: "/stock/retail-sales-report",
    schema: retailSalesCriteriaSchema as JsonSchemaObject,
  },
];
