import * as React from "react"
import { CodeBlock } from "@/components/ui/code-block"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  SchemaCriteriaFilterGroup,
  type CriteriaValidationResult,
  type JsonSchemaObject,
  type SchemaCriteriaFilterGroupHandle,
} from "@/features/report-criteria"
import { cn } from "@/utils/cn"
import stockBalanceCriteriaSchema from "../schemas/stock-balance-criteria.schema.json"

/** Report criteria schemas for Stock Balance (add more to create tabs). */
const stockBalanceSchemas = [
  stockBalanceCriteriaSchema as JsonSchemaObject,
] satisfies JsonSchemaObject[]

const schemaSource = JSON.stringify(stockBalanceCriteriaSchema, null, 2)

export const StockBalanceFilter = React.forwardRef<
  SchemaCriteriaFilterGroupHandle,
  { className?: string }
>(function StockBalanceFilter({ className }, ref) {
  const [outputJson, setOutputJson] = React.useState("{\n  \n}")
  const [debugTab, setDebugTab] = React.useState("schema")

  const handleValidate = React.useCallback(
    (result: CriteriaValidationResult) => {
      setOutputJson(JSON.stringify(result.instance, null, 2))
      setDebugTab("output")
    },
    []
  )

  return (
    <div
      className={cn(
        "flex min-h-0 min-w-0 w-full flex-1 flex-col overflow-hidden",
        className
      )}
    >
      <SchemaCriteriaFilterGroup
        ref={ref}
        schemas={stockBalanceSchemas}
        onValidate={handleValidate}
        className="min-h-0 min-w-0 flex-none"
      />

      <Tabs
        value={debugTab}
        onValueChange={setDebugTab}
        className="flex min-h-0 min-w-0 flex-1 flex-col gap-0 border-t bg-background"
      >
        <div className="shrink-0 border-b px-3 sm:px-4">
          <TabsList variant="line" className="h-8">
            <TabsTrigger value="schema">Schema</TabsTrigger>
            <TabsTrigger value="output">Output</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent
          value="schema"
          className="m-0 flex min-h-0 flex-1 flex-col overflow-hidden p-3 data-[state=inactive]:hidden sm:p-4"
        >
          <CodeBlock
            value={schemaSource}
            language="json"
            className="min-h-0 flex-1"
          />
        </TabsContent>
        <TabsContent
          value="output"
          className="m-0 flex min-h-0 flex-1 flex-col overflow-hidden p-3 data-[state=inactive]:hidden sm:p-4"
        >
          <CodeBlock
            value={outputJson}
            language="json"
            className="min-h-0 flex-1"
          />
        </TabsContent>
      </Tabs>
    </div>
  )
})
