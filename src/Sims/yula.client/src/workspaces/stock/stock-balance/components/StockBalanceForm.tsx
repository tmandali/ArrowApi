"use client";

import { ReportModuleForm } from "@/features/reports/components/ReportModuleForm"
import type { JsonSchemaObject } from "@/features/report-criteria"
import stockBalanceCriteriaSchema from "../schemas/stock-balance-criteria.schema.json"

/** İnce workspace wrapper — orkestrasyon `ReportModuleForm` içinde. */
export function StockBalanceForm() {
  return (
    <ReportModuleForm
      scope="stock-balance"
      title="Stock Balance"
      schema={stockBalanceCriteriaSchema as JsonSchemaObject}
      pagePath="/stock/stock-balance"
      workspace="stock"
    />
  )
}
