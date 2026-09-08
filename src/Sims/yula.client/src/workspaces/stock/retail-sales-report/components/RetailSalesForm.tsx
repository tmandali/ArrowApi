"use client";

import { ReportModuleForm } from "@/features/reports/components/ReportModuleForm"
import type { JsonSchemaObject } from "@/features/report-criteria"
import retailSalesCriteriaSchema from "../schemas/retail-sales-criteria.schema.json"

/** İnce workspace wrapper — orkestrasyon `ReportModuleForm` içinde. */
export function RetailSalesForm() {
  return (
    <ReportModuleForm
      scope="retail-sales-report"
      title="Retail Sales"
      schema={retailSalesCriteriaSchema as JsonSchemaObject}
      pagePath="/stock/retail-sales-report"
      workspace="stock"
    />
  )
}
