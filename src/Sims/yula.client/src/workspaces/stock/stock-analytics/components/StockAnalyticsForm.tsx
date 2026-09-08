"use client";

import { ReportModuleForm } from "@/features/reports/components/ReportModuleForm"
import type { JsonSchemaObject } from "@/features/report-criteria"
import stockAnalyticsCriteriaSchema from "../schemas/stock-analytics-criteria.schema.json"

/** İnce workspace wrapper — orkestrasyon `ReportModuleForm` içinde. */
export function StockAnalyticsForm() {
  return (
    <ReportModuleForm
      scope="stock-analytics"
      title="Stock Analytics"
      schema={stockAnalyticsCriteriaSchema as JsonSchemaObject}
      pagePath="/stock/stock-analytics"
      workspace="stock"
    />
  )
}
