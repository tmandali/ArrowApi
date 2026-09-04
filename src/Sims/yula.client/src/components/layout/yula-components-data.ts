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
import stockBalanceCriteriaSchema from "@/features/stock/stock-balance/schemas/stock-balance-criteria.schema.json"
import stockAnalyticsCriteriaSchema from "@/features/stock/stock-analytics/schemas/stock-analytics-criteria.schema.json"
import retailSalesCriteriaSchema from "@/features/stock/retail-sales-report/schemas/retail-sales-criteria.schema.json"


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
    description: "Rapor kriterlerini aşağıdan doldurun",
    pagePath: "/stock/stock-balance",
    schema: stockBalanceSchema,
  },
  {
    kind: yulaCustomKinds.stockAnalytics,
    scope: "stock-analytics",
    workspace: "stock",
    title: "Stock Analytics",
    description: "Stok analitik rapor kriterlerini doldurun",
    pagePath: "/stock/stock-analytics",
    schema: stockAnalyticsSchema,
  },
  {
    kind: yulaCustomKinds.retailSales,
    scope: "retail-sales-report",
    workspace: "stock",
    title: "Retail Sales",
    description: "Perakende satış rapor kriterlerini doldurun",
    pagePath: "/stock/retail-sales-report",
    schema: retailSalesSchema,
  },
]
