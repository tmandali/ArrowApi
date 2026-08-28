"use client";

import * as React from "react"
import { Input } from "@/components/ui/input"
import { cn } from "@/utils/cn"
import type {
  CriteriaComboboxOption,
  CriteriaFieldDef,
} from "../types"
import { CriteriaDateValueCell } from "./CriteriaDateValueCell"
import { CriteriaGridCellCombobox } from "./CriteriaGridCellCombobox"
import { CriteriaSimpleCombobox } from "./CriteriaSimpleCombobox"

const cellInputClass =
  "h-7 w-full min-w-0 rounded-none border border-transparent bg-transparent px-2 py-0 text-xs shadow-none outline-none ring-0 transition-none focus-visible:border-border focus-visible:bg-background focus-visible:ring-0 md:text-xs/relaxed placeholder:text-muted-foreground/70"

type CriteriaValueCellProps = {
  field?: CriteriaFieldDef
  value: string
  onChange: (value: string) => void
  className?: string
  "data-grid-cell"?: string
  invalid?: boolean
  variant?: "cell" | "form"
  /** When false, field description is not used as the input placeholder. */
  descriptionAsPlaceholder?: boolean
}

function resolveValueKey(field: CriteriaFieldDef): string {
  return field.lookupValueKey ?? field.lookupFields?.[0]?.key ?? "id"
}

function lookupOptions(
  field: CriteriaFieldDef,
  labelKeys: string[]
): CriteriaComboboxOption[] {
  const items = field.lookupItems ?? []
  const valueKey = resolveValueKey(field)
  const displayKey = labelKeys[0] ?? valueKey

  return items.map((item) => {
    const value = String(item[valueKey] ?? "")
    const display = String(item[displayKey] ?? "")
    const label =
      !display || displayKey === valueKey || display === value
        ? value
        : `${value}·${display}`
    return {
      value,
      label: label || value,
      searchText: display || value,
    }
  })
}

function selectDisplayField(key: string): string[] {
  return [key]
}

function ObjectLookupValueCell({
  field,
  value,
  onChange,
  className,
  "data-grid-cell": dataGridCell,
  invalid = false,
  variant = "cell",
  descriptionAsPlaceholder = true,
}: {
  field: CriteriaFieldDef
  value: string
  onChange: (value: string) => void
  className?: string
  "data-grid-cell"?: string
  invalid?: boolean
  variant?: "cell" | "form"
  descriptionAsPlaceholder?: boolean
}) {
  const displayFields = field.lookupFields ?? []
  const valueKey = resolveValueKey(field)
  const defaultKeys = [
    field.lookupLabelKeys?.[0] ??
      displayFields.find((item) => item.key !== valueKey)?.key ??
      valueKey,
  ]
  const [selectedDisplayFields, setSelectedDisplayFields] =
    React.useState(defaultKeys)
  const previousFieldKeyRef = React.useRef(field.key)

  if (previousFieldKeyRef.current !== field.key) {
    previousFieldKeyRef.current = field.key
    setSelectedDisplayFields(defaultKeys)
  }

  const options = React.useMemo(
    () => lookupOptions(field, selectedDisplayFields),
    [field, selectedDisplayFields]
  )

  const inputClass =
    variant === "cell"
      ? cn(
          cellInputClass,
          invalid && "border-destructive focus-visible:border-destructive",
          className
        )
      : cn(
          "h-9 text-xs bg-muted/30",
          invalid && "border-destructive focus-visible:border-destructive",
          className
        )

  const description = field.description?.trim()
  const placeholder =
    descriptionAsPlaceholder && description ? description : undefined

  return (
    <CriteriaGridCellCombobox
      value={value}
      onChange={onChange}
      options={options}
      placeholder={placeholder}
      data-grid-cell={dataGridCell}
      aria-invalid={invalid || undefined}
      className={inputClass}
      multiple={field.selectionMode === "multiple"}
      showAdvancedSearch
      displayFields={displayFields}
      selectedDisplayFields={selectedDisplayFields}
      onSelectedDisplayFieldsChange={(key) =>
        setSelectedDisplayFields(selectDisplayField(key))
      }
    />
  )
}

export function CriteriaValueCell({
  field,
  value,
  onChange,
  className,
  "data-grid-cell": dataGridCell,
  invalid = false,
  variant = "cell",
  descriptionAsPlaceholder = true,
}: CriteriaValueCellProps) {
  const inputClass =
    variant === "cell"
      ? cn(
          cellInputClass,
          invalid && "border-destructive focus-visible:border-destructive",
          className
        )
      : cn(
          "h-9 text-xs bg-muted/30",
          invalid && "border-destructive focus-visible:border-destructive",
          className
        )

  const description = field?.description?.trim()
  const placeholder =
    descriptionAsPlaceholder && description ? description : undefined

  const control = (() => {
    if (!field) {
      return (
        <Input
          value={value}
          data-grid-cell={dataGridCell}
          aria-invalid={invalid || undefined}
          disabled
          onChange={(event) => onChange(event.target.value)}
          className={inputClass}
        />
      )
    }

    switch (field.kind) {
      case "enum":
        return (
          <CriteriaSimpleCombobox
            value={value}
            onChange={onChange}
            options={(field.enumValues ?? []).map((item) => ({
              value: item,
              label: item,
            }))}
            placeholder={placeholder}
            data-grid-cell={dataGridCell}
            aria-invalid={invalid || undefined}
            className={inputClass}
            multiple={field.selectionMode === "multiple"}
            variant={variant}
          />
        )
      case "objectLookup":
        return (
          <ObjectLookupValueCell
            field={field}
            value={value}
            onChange={onChange}
            className={className}
            data-grid-cell={dataGridCell}
            invalid={invalid}
            variant={variant}
            descriptionAsPlaceholder={descriptionAsPlaceholder}
          />
        )
      case "number":
        return (
          <Input
            type="number"
            value={value}
            data-grid-cell={dataGridCell}
            aria-invalid={invalid || undefined}
            min={field.minimum}
            max={field.maximum}
            placeholder={placeholder}
            onChange={(event) => onChange(event.target.value)}
            className={cn(
              inputClass,
              variant === "cell" && value.trim() !== "" && "text-right"
            )}
          />
        )
      case "boolean":
        return (
          <CriteriaSimpleCombobox
            value={value}
            onChange={onChange}
            options={[
              { value: "true", label: "True" },
              { value: "false", label: "False" },
            ]}
            placeholder={placeholder}
            data-grid-cell={dataGridCell}
            aria-invalid={invalid || undefined}
            className={inputClass}
            variant={variant}
          />
        )
      case "string":
        if (field.format === "date") {
          return (
            <CriteriaDateValueCell
              field={field}
              value={value}
              onChange={onChange}
              data-grid-cell={dataGridCell}
              invalid={invalid}
              variant={variant}
              placeholder={placeholder}
              className={inputClass}
            />
          )
        }
        return (
          <Input
            value={value}
            data-grid-cell={dataGridCell}
            aria-invalid={invalid || undefined}
            placeholder={placeholder}
            onChange={(event) => onChange(event.target.value)}
            className={inputClass}
          />
        )
      default: {
        const _exhaustive: never = field.kind
        void _exhaustive
        return null
      }
    }
  })()

  if (variant === "form" && description) {
    return (
      <div className="space-y-1.5">
        {control}
        <p className="text-[11px] text-muted-foreground">{description}</p>
      </div>
    )
  }

  return control
}
