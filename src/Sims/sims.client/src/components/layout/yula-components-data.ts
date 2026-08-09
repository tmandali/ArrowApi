import type { JsonSchemaObject } from "@/features/report-criteria"
import stockBalanceCriteriaSchema from "@/features/stock/item/schemas/stock-balance-criteria.schema.json"

/**
 * Custom message part kinds Yula can embed in the conversation.
 * Format follows the AI SDK convention `{provider}.{provider-type}`.
 */
export const yulaCustomKinds = {
  stockBalance: "yula.report.stock-balance",
} as const

export type YulaCustomKind = (typeof yulaCustomKinds)[keyof typeof yulaCustomKinds]

export type YulaReportCardConfig = {
  kind: string
  /** Draft criteria store scope shared with the report page filter. */
  scope: string
  title: string
  description?: string
  /** Where "Sayfada aç" navigates (the report's full page). */
  pagePath: string
  schema: JsonSchemaObject
}

const stockBalanceSchema = stockBalanceCriteriaSchema as JsonSchemaObject

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
]
