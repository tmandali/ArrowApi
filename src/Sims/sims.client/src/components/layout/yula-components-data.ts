import type { JsonSchemaObject } from "@/features/report-criteria"
import type { YulaReportCardConfig } from "@/lib/auto-report-registry"
import stockBalanceCriteriaSchema from "@/features/stock/item/schemas/stock-balance-criteria.schema.json"
import stockAnalyticsCriteriaSchema from "@/features/stock/item/schemas/stock-analytics-criteria.schema.json"

export type { YulaReportCardConfig }

/**
 * Custom message part kinds Yula can embed in the conversation.
 * Format follows the AI SDK convention `{provider}.{provider-type}`.
 */
export const yulaCustomKinds = {
  stockBalance: "yula.report.stock-balance",
  stockAnalytics: "yula.report.stock-analytics",
} as const

export type YulaCustomKind = (typeof yulaCustomKinds)[keyof typeof yulaCustomKinds]

const stockBalanceSchema = stockBalanceCriteriaSchema as JsonSchemaObject
const stockAnalyticsSchema = stockAnalyticsCriteriaSchema as JsonSchemaObject

/**
 * Report cards Yula can embed. Register any report here to get a shared
 * criteria card in the conversation; scope must match the page filter's scope.
 */
export const yulaReportCardConfigs: YulaReportCardConfig[] = [
  {
    kind: yulaCustomKinds.stockBalance,
    scope: "stock-balance",
    title: "Stock Balance",
    description: "Rapor kriterlerini aşağıdan doldurun",
    pagePath: "/stock/stock-balance",
    schema: stockBalanceSchema,
  },
  {
    kind: yulaCustomKinds.stockAnalytics,
    scope: "stock-analytics",
    title: "Stock Analytics",
    description: "Stok analitik rapor kriterlerini doldurun",
    pagePath: "/stock/analytics",
    schema: stockAnalyticsSchema,
  },
]
