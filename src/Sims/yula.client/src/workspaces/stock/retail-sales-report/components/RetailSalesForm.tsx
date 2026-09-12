"use client";

import { ReportModuleForm } from "@/features/reports/components/ReportModuleForm"
import { useTranslations } from "next-intl"
import type { JsonSchemaObject } from "@/features/report-criteria"
import retailSalesCriteriaSchema from "../schemas/retail-sales-criteria.schema.json"

/** İnce workspace wrapper — orkestrasyon `ReportModuleForm` içinde. */
export function RetailSalesForm() {
  const t = useTranslations("Stock");
  return (
    <ReportModuleForm
      scope="retail-sales-report"
      title={t("page_retail_sales")}
      schema={retailSalesCriteriaSchema as JsonSchemaObject}
      pagePath="/stock/retail-sales-report"
      workspace="stock"
    />
  )
}
