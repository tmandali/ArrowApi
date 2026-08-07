import * as React from "react"
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxValue,
  useComboboxAnchor,
} from "@/components/ui/combobox"
import { cn } from "@/utils/cn"
import type { CriteriaComboboxOption } from "../types"
import { joinMultiValue, splitMultiValue } from "../lib/multi-value"

function normalizeOptions(
  options: Array<string | CriteriaComboboxOption>
): CriteriaComboboxOption[] {
  return options.map((option) =>
    typeof option === "string" ? { value: option, label: option } : option
  )
}

type CriteriaSimpleComboboxProps = {
  value: string
  onChange: (value: string) => void
  options: Array<string | CriteriaComboboxOption>
  placeholder?: string
  className?: string
  "data-grid-cell"?: string
  "aria-invalid"?: boolean
  multiple?: boolean
  variant?: "cell" | "form"
  showClear?: boolean
}

const cellFrameClass =
  "h-9 min-h-9 w-full rounded-none border border-transparent bg-transparent p-0 shadow-none ring-0 " +
  "focus-within:border-border focus-within:bg-background focus-within:ring-0 " +
  "has-[[data-slot=input-group-control]:focus-visible]:border-border " +
  "has-[[data-slot=input-group-control]:focus-visible]:ring-0 " +
  // Keep padding on the input only (same as grid textbox px-2 py-0); never on the InputGroup frame.
  "[&_[data-slot=input-group-control]]:h-9 [&_[data-slot=input-group-control]]:px-2 [&_[data-slot=input-group-control]]:py-0 [&_[data-slot=input-group-control]]:text-xs/relaxed " +
  "[&_[data-slot=input-group-addon]]:py-0 [&_[data-slot=input-group-addon]]:pr-1 " +
  "dark:bg-transparent"

const formFrameClass =
  "h-9 min-h-9 w-full rounded-md border border-muted-foreground/20 bg-muted/30 shadow-none " +
  "focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30 " +
  "[&_[data-slot=input-group-control]]:h-9 [&_[data-slot=input-group-control]]:text-xs/relaxed " +
  "dark:bg-muted/30"

export function CriteriaSimpleCombobox({
  value,
  onChange,
  options,
  placeholder,
  className,
  "data-grid-cell": dataGridCell,
  "aria-invalid": ariaInvalid,
  multiple = false,
  variant = "cell",
  showClear = true,
}: CriteriaSimpleComboboxProps) {
  const items = React.useMemo(() => normalizeOptions(options), [options])
  const anchor = useComboboxAnchor()

  const selectedItems = React.useMemo(() => {
    if (!multiple) return undefined
    return splitMultiValue(value)
      .map((selected) => items.find((item) => item.value === selected))
      .filter((item): item is CriteriaComboboxOption => !!item)
  }, [items, multiple, value])

  const singleValue = React.useMemo(() => {
    if (multiple) return null
    return items.find((item) => item.value === value) ?? null
  }, [items, multiple, value])

  const frameClass = cn(
    variant === "cell" ? cellFrameClass : formFrameClass,
    ariaInvalid &&
      "border-destructive focus-within:border-destructive focus-within:ring-destructive/20 has-[[data-slot=input-group-control]:focus-visible]:border-destructive has-[[data-slot=input-group-control]:focus-visible]:ring-destructive/20",
    className,
    // cellInputClass often includes px-2; that must not pad the InputGroup (would double with input px-2).
    variant === "cell" && "px-0 py-0"
  )

  if (multiple) {
    return (
      <Combobox
        multiple
        items={items}
        value={selectedItems}
        onValueChange={(next) => {
          const values =
            (next as CriteriaComboboxOption[] | null)?.map(
              (item) => item.value
            ) ?? []
          onChange(joinMultiValue(values))
        }}
        itemToStringValue={(item) => item.label}
      >
        <ComboboxChips
          ref={anchor}
          className={cn(
            frameClass,
            "gap-1 px-2 py-0.5",
            variant === "cell" && "bg-clip-border"
          )}
          data-grid-cell={dataGridCell}
          aria-invalid={ariaInvalid}
        >
          <ComboboxValue>
            {(selectedItems ?? []).map((item) => (
              <ComboboxChip key={item.value}>{item.label}</ComboboxChip>
            ))}
          </ComboboxValue>
          <ComboboxChipsInput
            placeholder={placeholder}
            className="text-xs/relaxed md:text-xs/relaxed"
          />
        </ComboboxChips>
        <ComboboxContent anchor={anchor}>
          <ComboboxEmpty>No results.</ComboboxEmpty>
          <ComboboxList>
            {(item) => (
              <ComboboxItem key={item.value} value={item}>
                {item.label}
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    )
  }

  return (
    <Combobox
      items={items}
      value={singleValue}
      onValueChange={(next) => {
        const item = next as CriteriaComboboxOption | null
        onChange(item?.value ?? "")
      }}
      itemToStringValue={(item) => item.label}
    >
      <ComboboxInput
        placeholder={placeholder}
        showClear={showClear && Boolean(value)}
        showTrigger={variant === "form"}
        className={frameClass}
        data-grid-cell={dataGridCell}
        aria-invalid={ariaInvalid}
      />
      <ComboboxContent>
        <ComboboxEmpty>No results.</ComboboxEmpty>
        <ComboboxList>
          {(item) => (
            <ComboboxItem key={item.value} value={item}>
              {item.label}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}
