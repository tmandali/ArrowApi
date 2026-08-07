import * as React from "react"
import {
  SchemaCriteriaFilterGroup,
  type JsonSchemaObject,
  type SchemaCriteriaFilterGroupHandle,
} from "@/features/report-criteria"
import stockBalanceCriteriaSchema from "../schemas/stock-balance-criteria.schema.json"

/** Report criteria schemas for Stock Balance (add more to create tabs). */
const stockBalanceSchemas = [
  stockBalanceCriteriaSchema as JsonSchemaObject,
] satisfies JsonSchemaObject[]

export const StockBalanceFilter = React.forwardRef<
  SchemaCriteriaFilterGroupHandle,
  object
>(function StockBalanceFilter(_props, ref) {
  return (
    <SchemaCriteriaFilterGroup ref={ref} schemas={stockBalanceSchemas} />
  )
})
