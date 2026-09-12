"use client";

import { ReportModuleForm } from "@/features/reports/components/ReportModuleForm"
import { useTranslations } from "next-intl"
import type { JsonSchemaObject } from "@/features/report-criteria"
import stockAnalyticsCriteriaSchema from "../schemas/stock-analytics-criteria.schema.json"

/** İnce workspace wrapper — orkestrasyon `ReportModuleForm` içinde. */
export function StockAnalyticsForm() {
  const t = useTranslations("Stock");
  return (
    <ReportModuleForm
      scope="stock-analytics"
      title={t("page_analytics")}
      schema={stockAnalyticsCriteriaSchema as JsonSchemaObject}
      pagePath="/stock/stock-analytics"
      workspace="stock"
    />
  )
}
