import type { JsonSchemaObject } from "@/features/report-criteria"
export interface YulaReportCardConfig {
  kind: string;
  scope: string;
  workspace?: string;
  title: string;
  description?: string;
  pagePath: string;
  schema: JsonSchemaObject;
}
import {
  stockBalanceCriteriaSchema,
  stockAnalyticsCriteriaSchema,
  retailSalesCriteriaSchema,
} from "@/workspaces/stock"


/**
 * Custom message part kinds Yula can embed in the conversation.
 * Format follows the AI SDK convention `{provider}.{provider-type}`.
 */
export const yulaCustomKinds = {
  stockBalance: "yula.report.stock-balance",
  stockAnalytics: "yula.report.stock-analytics",
  retailSales: "yula.report.retail-sales-report",
} as const

export type YulaCustomKind = (typeof yulaCustomKinds)[keyof typeof yulaCustomKinds]

const stockBalanceSchema = stockBalanceCriteriaSchema as JsonSchemaObject
const stockAnalyticsSchema = stockAnalyticsCriteriaSchema as JsonSchemaObject
const retailSalesSchema = retailSalesCriteriaSchema as JsonSchemaObject

/**
 * Report cards Yula can embed. Register any report here to get a shared
 * criteria card in the conversation; scope must match the page filter's scope.
 */
export const yulaReportCardConfigs: YulaReportCardConfig[] = [
  {
    kind: yulaCustomKinds.stockBalance,
    scope: "stock-balance",
    workspace: "stock",
    title: "Stock Balance",
    description: "Fill in the report criteria below",
    pagePath: "/stock/stock-balance",
    schema: stockBalanceSchema,
  },
  {
    kind: yulaCustomKinds.stockAnalytics,
    scope: "stock-analytics",
    workspace: "stock",
    title: "Stock Analytics",
    description: "Fill in the stock analytics report criteria",
    pagePath: "/stock/stock-analytics",
    schema: stockAnalyticsSchema,
  },
  {
    kind: yulaCustomKinds.retailSales,
    scope: "retail-sales-report",
    workspace: "stock",
    title: "Retail Sales",
    description: "Fill in the retail sales report criteria",
    pagePath: "/stock/retail-sales-report",
    schema: retailSalesSchema,
  },
]
