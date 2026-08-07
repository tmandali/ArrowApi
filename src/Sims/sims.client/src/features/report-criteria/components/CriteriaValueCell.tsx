import { Input } from "@/components/ui/input"
import { cn } from "@/utils/cn"
import type { CriteriaComboboxOption, CriteriaFieldDef } from "../types"
import { CriteriaGridCellCombobox } from "./CriteriaGridCellCombobox"
import { CriteriaSimpleCombobox } from "./CriteriaSimpleCombobox"

const cellInputClass =
  "h-9 w-full min-w-0 rounded-none border border-transparent bg-transparent px-2 py-0 text-xs shadow-none outline-none ring-0 transition-none focus-visible:border-border focus-visible:bg-background focus-visible:ring-0 md:text-xs/relaxed placeholder:text-muted-foreground/70"

type CriteriaValueCellProps = {
  field?: CriteriaFieldDef
  value: string
  onChange: (value: string) => void
  className?: string
  "data-grid-cell"?: string
  invalid?: boolean
  variant?: "cell" | "form"
}

function lookupOptions(field: CriteriaFieldDef): CriteriaComboboxOption[] {
  const items = field.lookupItems ?? []
  const valueKey = field.lookupValueKey ?? "kod"
  const labelKeys = field.lookupLabelKeys ?? [valueKey]

  return items.map((item) => {
    const value = String(item[valueKey] ?? "")
    const label = labelKeys
      .map((key) => String(item[key] ?? ""))
      .filter(Boolean)
      .join(" — ")
    return { value, label: label || value }
  })
}

export function CriteriaValueCell({
  field,
  value,
  onChange,
  className,
  "data-grid-cell": dataGridCell,
  invalid = false,
  variant = "cell",
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
  const placeholder = description || undefined

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
          <CriteriaGridCellCombobox
            value={value}
            onChange={onChange}
            options={lookupOptions(field)}
            placeholder={placeholder}
            data-grid-cell={dataGridCell}
            aria-invalid={invalid || undefined}
            className={inputClass}
            multiple={field.selectionMode === "multiple"}
            showAdvancedSearch
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
            className={cn(inputClass, variant === "cell" && "text-right")}
          />
        )
      case "string":
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
