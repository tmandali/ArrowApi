"use client";

import * as React from "react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/utils/cn"
import type {
  CriteriaValidationResult,
  JsonSchemaObject,
} from "../types"
import { readJobEndpoint } from "../lib/job-endpoint"
import {
  SchemaCriteriaFilter,
  type SchemaCriteriaFilterHandle,
} from "./SchemaCriteriaFilter"

function schemaTabId(schema: JsonSchemaObject, index: number): string {
  const raw =
    (typeof schema.$id === "string" && schema.$id) ||
    (typeof schema.title === "string" && schema.title) ||
    `schema-${index}`
  return `${index}-${raw}`.replace(/\s+/g, "-").toLowerCase()
}

function schemaTabLabel(schema: JsonSchemaObject, index: number): string {
  const title = schema.title?.trim()
  return title || `Schema ${index + 1}`
}

export type SchemaCriteriaFilterGroupHandle = {
  submit: () => CriteriaValidationResult
}

export type SchemaCriteriaFilterGroupProps = {
  schemas: JsonSchemaObject[]
  className?: string
  onValidate?: (result: CriteriaValidationResult) => void
}

export const SchemaCriteriaFilterGroup = React.forwardRef<
  SchemaCriteriaFilterGroupHandle,
  SchemaCriteriaFilterGroupProps
>(function SchemaCriteriaFilterGroup(
  { schemas, className, onValidate },
  ref
) {
  const tabs = React.useMemo(
    () =>
      schemas.map((schema, index) => ({
        id: schemaTabId(schema, index),
        label: schemaTabLabel(schema, index),
        schema,
      })),
    [schemas]
  )

  const [activeTab, setActiveTab] = React.useState(tabs[0]?.id ?? "")
  const filterRefs = React.useRef<Array<SchemaCriteriaFilterHandle | null>>([])

  // Sekme listesi/tür değişince geçersiz türü başa al — render sırasında
  // state ayarlama (effect'siz türev).
  const validityKey = `${tabs.map((tab) => tab.id).join("|")}|${activeTab}`
  const [syncedValidityKey, setSyncedValidityKey] = React.useState(validityKey)
  if (syncedValidityKey !== validityKey) {
    setSyncedValidityKey(validityKey)
    if (!tabs.some((tab) => tab.id === activeTab) && tabs[0]) {
      setActiveTab(tabs[0].id)
    }
  }

  React.useImperativeHandle(
    ref,
    () => ({
      submit: () => {
        const results = tabs.map((_, index) =>
          filterRefs.current[index]?.submit()
        )

        const firstInvalidIndex = results.findIndex(
          (result) => result && !result.valid
        )
        if (firstInvalidIndex >= 0) {
          setActiveTab(tabs[firstInvalidIndex]?.id ?? activeTab)
        }

        const mergedErrors = results.flatMap((result) => result?.errors ?? [])
        const mergedInstance = Object.assign(
          {},
          ...results.map((result) => result?.instance ?? {})
        )
        const activeSchema = tabs.find((tab) => tab.id === activeTab)?.schema
        const merged: CriteriaValidationResult = {
          valid: results.every((result) => result?.valid),
          instance: mergedInstance,
          errors: mergedErrors,
          ajvErrors: results.flatMap((result) => result?.ajvErrors ?? []),
          jobEndpoint:
            readJobEndpoint(activeSchema) ??
            results.find((result) => result?.jobEndpoint)?.jobEndpoint,
        }

        onValidate?.(merged)
        return merged
      },
    }),
    [tabs, activeTab, onValidate]
  )

  if (tabs.length === 0) {
    return (
      <div className={cn("p-6 text-xs text-muted-foreground", className)}>
        No criteria schemas provided.
      </div>
    )
  }

  return (
    <Tabs
      value={activeTab}
      onValueChange={setActiveTab}
      className={cn(
        "flex min-h-0 min-w-0 w-full flex-1 flex-col gap-0 overflow-hidden",
        className
      )}
    >
      <div className="shrink-0 border-b bg-background px-3 sm:px-4">
        <ScrollArea type="hover" className="w-full whitespace-nowrap">
          <div className="py-1">
            <TabsList variant="line" className="min-w-max">
              {tabs.map((tab) => (
                <TabsTrigger key={tab.id} value={tab.id}>
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
        </ScrollArea>
      </div>

      {tabs.map((tab, index) => (
        <TabsContent
          key={tab.id}
          value={tab.id}
          className="m-0 min-h-0 min-w-0 overflow-x-hidden overflow-y-auto data-[state=inactive]:hidden"
        >
          <SchemaCriteriaFilter
            ref={(handle) => {
              filterRefs.current[index] = handle
            }}
            schema={tab.schema}
            showHeader={false}
            className="h-auto p-3 sm:p-4"
          />
        </TabsContent>
      ))}
    </Tabs>
  )
})
