"use client";

import * as React from "react"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group"
import {
  Popover,
  PopoverAnchor,
} from "@/components/ui/popover"
import { X } from "lucide-react"
import { cn } from "@/utils/cn"
import type { CriteriaComboboxOption, CriteriaLookupField } from "../types"
import {
  joinMultiValue,
  splitMultiValue,
  toggleMultiValue,
} from "../lib/multi-value"
import { useFitChipCount } from "./use-fit-chip-count"
import { DisplayFieldsMenu } from "./display-fields-menu"
import { CriteriaComboboxPopover } from "./criteria-combobox-popover"
import { CriteriaMultiSelectAnchor } from "./criteria-multi-select-anchor"

function normalizeOptions(
  options: Array<string | CriteriaComboboxOption>
): CriteriaComboboxOption[] {
  return options.map((option) =>
    typeof option === "string"
      ? { value: option, label: option, searchText: option }
      : {
          value: option.value,
          label: option.label,
          searchText: option.searchText ?? option.label,
        }
  )
}

export type CriteriaGridCellComboboxProps = {
  value: string
  onChange: (value: string) => void
  options: Array<string | CriteriaComboboxOption>
  placeholder?: string
  className?: string
  onAdvancedSearch?: () => void
  showAdvancedSearch?: boolean
  "data-grid-cell"?: string
  "aria-invalid"?: boolean
  multiple?: boolean
  displayFields?: CriteriaLookupField[]
  selectedDisplayFields?: string[]
  onSelectedDisplayFieldsChange?: (fieldKey: string) => void
}

export function CriteriaGridCellCombobox({
  value,
  onChange,
  options,
  placeholder,
  className,
  onAdvancedSearch,
  showAdvancedSearch = false,
  "data-grid-cell": dataGridCell,
  "aria-invalid": ariaInvalid,
  multiple = false,
  displayFields = [],
  selectedDisplayFields = [],
  onSelectedDisplayFieldsChange,
}: CriteriaGridCellComboboxProps) {
  const [open, setOpen] = React.useState(false)
  const [width, setWidth] = React.useState<number>()
  const [query, setQuery] = React.useState("")
  const [focused, setFocused] = React.useState(false)
  const [activeIndex, setActiveIndex] = React.useState(0)
  const anchorRef = React.useRef<HTMLDivElement>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const listRef = React.useRef<HTMLDivElement>(null)
  const ignoreCloseRef = React.useRef(false)

  const showDisplayMenu =
    displayFields.length > 1 && !!onSelectedDisplayFieldsChange

  const displayMenu = showDisplayMenu ? (
    <DisplayFieldsMenu
      displayFields={displayFields}
      selectedDisplayFields={selectedDisplayFields}
      onSelectedDisplayFieldsChange={onSelectedDisplayFieldsChange}
    />
  ) : null

  const normalized = React.useMemo(
    () => normalizeOptions(options),
    [options]
  )

  const selectedValues = React.useMemo(
    () => (multiple ? splitMultiValue(value) : value ? [value] : []),
    [multiple, value]
  )

  const selectedItems = React.useMemo(
    () =>
      selectedValues.map((selected) => {
        const match = normalized.find((option) => option.value === selected)
        return {
          value: selected,
          label: match?.label ?? selected,
        }
      }),
    [normalized, selectedValues]
  )

  const selectedItemsKey = selectedItems
    .map((item) => `${item.value}:${item.label}`)
    .join("|")

  const { visibleCount, measureRef } = useFitChipCount(
    anchorRef,
    multiple ? selectedItems.length : 0,
    `${selectedItemsKey}|${focused ? "1" : "0"}|${showDisplayMenu ? "1" : "0"}`
  )
  const hiddenCount = Math.max(0, selectedItems.length - visibleCount)
  const visibleItems = selectedItems.slice(0, visibleCount)

  const displayValue = React.useMemo(() => {
    const match = normalized.find((option) => option.value === value)
    return match?.label ?? value
  }, [normalized, value])

  const filtered = React.useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    if (!normalizedQuery) return normalized
    return normalized.filter((option) =>
      (option.searchText ?? option.label)
        .toLowerCase()
        .includes(normalizedQuery)
    )
  }, [normalized, query])

  const activeValue = filtered[activeIndex]?.value ?? ""

  // Açılış/sorgu değişiminde seçimi başa al, liste kısalınca kırp —
  // render sırasında state ayarlama (effect'siz türev).
  const [syncedOpenQuery, setSyncedOpenQuery] = React.useState<string | null>(null)
  const openQueryKey = `${open}|${query}`
  if (syncedOpenQuery !== openQueryKey) {
    setSyncedOpenQuery(openQueryKey)
    if (open) {
      setActiveIndex(0)
    }
  }

  const [syncedLengthOpen, setSyncedLengthOpen] = React.useState<string | null>(null)
  const lengthOpenKey = `${open}|${filtered.length}`
  if (syncedLengthOpen !== lengthOpenKey) {
    setSyncedLengthOpen(lengthOpenKey)
    if (open) {
      setActiveIndex((prev) =>
        filtered.length === 0 ? 0 : Math.min(prev, filtered.length - 1)
      )
    }
  }

  React.useEffect(() => {
    if (!open || !activeValue) return
    const item = listRef.current?.querySelector<HTMLElement>(
      `[data-option-value="${CSS.escape(activeValue)}"]`
    )
    item?.scrollIntoView({ block: "nearest" })
  }, [activeValue, open])

  const isInsideAnchor = (target: EventTarget | null) =>
    target instanceof Node && !!anchorRef.current?.contains(target)

  const openDropdown = (nextQuery = "") => {
    const measured = anchorRef.current?.offsetWidth ?? 0
    setWidth(measured > 0 ? measured : undefined)
    setQuery(nextQuery)
    setActiveIndex(0)
    ignoreCloseRef.current = true
    setOpen(true)
    window.setTimeout(() => {
      ignoreCloseRef.current = false
    }, 0)
  }

  const clearValue = () => {
    onChange("")
    setQuery("")
    openDropdown("")
    inputRef.current?.focus()
  }

  const removeChip = (optionValue: string) => {
    onChange(joinMultiValue(selectedValues.filter((item) => item !== optionValue)))
    inputRef.current?.focus()
  }

  const selectOption = (option: CriteriaComboboxOption) => {
    if (multiple) {
      onChange(toggleMultiValue(value, option.value))
      setQuery("")
      return
    }
    onChange(option.value)
    setQuery("")
    setOpen(false)
  }

  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Tab" || event.key === "Escape") {
      ignoreCloseRef.current = false
      setQuery("")
      setOpen(false)
      return
    }

    if (
      multiple &&
      event.key === "Backspace" &&
      !query &&
      selectedValues.length > 0
    ) {
      event.preventDefault()
      removeChip(selectedValues[selectedValues.length - 1]!)
      return
    }

    if (event.key === "ArrowDown") {
      event.preventDefault()
      if (!open) {
        openDropdown(multiple ? query : "")
        return
      }
      if (filtered.length === 0) return
      setActiveIndex((prev) => (prev + 1) % filtered.length)
      return
    }

    if (event.key === "ArrowUp") {
      event.preventDefault()
      if (!open) {
        openDropdown(multiple ? query : "")
        return
      }
      if (filtered.length === 0) return
      setActiveIndex((prev) => (prev - 1 + filtered.length) % filtered.length)
      return
    }

    if (event.key === "Home" && open && filtered.length > 0) {
      event.preventDefault()
      setActiveIndex(0)
      return
    }

    if (event.key === "End" && open && filtered.length > 0) {
      event.preventDefault()
      setActiveIndex(filtered.length - 1)
      return
    }

    if (event.key === "Enter" && open) {
      const option = filtered[activeIndex]
      if (!option) return
      event.preventDefault()
      selectOption(option)
    }
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (!next && ignoreCloseRef.current) return
        if (!next) setQuery("")
        setOpen(next)
      }}
    >
      <PopoverAnchor asChild>
        {multiple ? (
          <CriteriaMultiSelectAnchor
            anchorRef={anchorRef}
            measureRef={measureRef}
            inputRef={inputRef}
            dataGridCell={dataGridCell}
            ariaInvalid={ariaInvalid}
            className={className}
            selectedItems={selectedItems}
            visibleItems={visibleItems}
            hiddenCount={hiddenCount}
            selectedValues={selectedValues}
            query={query}
            placeholder={placeholder}
            focused={focused}
            displayMenu={displayMenu}
            onRemoveChip={removeChip}
            onOpenDropdown={openDropdown}
            onSetFocused={setFocused}
            onKeyDown={handleInputKeyDown}
            onClearValue={clearValue}
          />
        ) : (
          <InputGroup
            ref={anchorRef}
            data-grid-cell={dataGridCell}
            aria-invalid={ariaInvalid || undefined}
            className={cn(
              "h-7 min-h-7 w-full rounded-none border-transparent bg-transparent p-0 shadow-none",
              "has-[[data-slot=input-group-control]:focus-visible]:border-border",
              "has-[[data-slot=input-group-control]:focus-visible]:ring-0",
              "[&_[data-slot=input-group-addon]]:py-0 [&_[data-slot=input-group-addon]]:pr-1",
              ariaInvalid &&
                "border-destructive has-[[data-slot=input-group-control]:focus-visible]:border-destructive",
              className,
              "px-0"
            )}
          >
            <InputGroupInput
              ref={inputRef}
              value={open ? query : displayValue}
              placeholder={placeholder}
              aria-invalid={ariaInvalid}
              onChange={(event) => {
                const next = event.target.value
                onChange(next)
                openDropdown(next)
              }}
              onFocus={(event) => {
                setFocused(true)
                openDropdown("")
                event.currentTarget.select()
              }}
              onBlur={() => setFocused(false)}
              onKeyDown={handleInputKeyDown}
              className="h-9 rounded-none px-2 py-0 text-xs shadow-none md:text-xs/relaxed"
              autoComplete="off"
            />
            <InputGroupAddon align="inline-end" className="gap-0 py-0 pr-1">
              {focused && value ? (
                <InputGroupButton
                  variant="ghost"
                  size="icon-xs"
                  aria-label="Clear"
                  className="text-muted-foreground hover:text-foreground"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={clearValue}
                >
                  <X />
                </InputGroupButton>
              ) : null}
              {displayMenu}
            </InputGroupAddon>
          </InputGroup>
        )}
      </PopoverAnchor>
      <CriteriaComboboxPopover
        width={width}
        activeValue={activeValue}
        filtered={filtered}
        selectedValues={selectedValues}
        multiple={multiple}
        showAdvancedSearch={showAdvancedSearch}
        listRef={listRef}
        isInsideAnchor={isInsideAnchor}
        onSelectOption={selectOption}
        onActiveChange={(next) => {
          const index = filtered.findIndex((option) => option.value === next)
          if (index >= 0) setActiveIndex(index)
        }}
        onDone={() => {
          setQuery("")
          setOpen(false)
        }}
        onAdvancedSearch={() => {
          onAdvancedSearch?.()
          setOpen(false)
        }}
      />
    </Popover>
  )
}
