"use client";

import { ReportModuleForm } from "@/features/reports/components/ReportModuleForm"
import { useTranslations } from "next-intl"
import type { JsonSchemaObject } from "@/features/report-criteria"
import stockBalanceCriteriaSchema from "../schemas/stock-balance-criteria.schema.json"

/** İnce workspace wrapper — orkestrasyon `ReportModuleForm` içinde. */
export function StockBalanceForm() {
  const t = useTranslations("Stock");
  return (
    <ReportModuleForm
      scope="stock-balance"
      title={t("page_balance")}
      schema={stockBalanceCriteriaSchema as JsonSchemaObject}
      pagePath="/stock/stock-balance"
      workspace="stock"
    />
  )
}
