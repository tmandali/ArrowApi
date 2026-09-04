"use client";

import * as React from "react"
import { Button } from "@/components/ui/button"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command"
import { MoreHorizontal, Search, X } from "lucide-react"
import { cn } from "@/utils/cn"
import type { CriteriaComboboxOption, CriteriaLookupField } from "../types"
import {
  joinMultiValue,
  splitMultiValue,
  toggleMultiValue,
} from "../lib/multi-value"

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

type CriteriaGridCellComboboxProps = {
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

const chipClass =
  "flex h-[calc(--spacing(4.75))] w-fit max-w-28 shrink-0 items-center justify-center gap-1 rounded-[calc(var(--radius-sm)-2px)] bg-muted-foreground/10 px-1.5 text-xs/relaxed font-medium text-foreground"

const CHIP_GAP_PX = 4
/** Keep a small caret; do not reserve a full empty input width or chips under-fit. */
const INPUT_CARET_PX = 24

function useFitChipCount(
  containerRef: React.RefObject<HTMLElement | null>,
  itemCount: number,
  itemKey: string
) {
  const measureRef = React.useRef<HTMLDivElement>(null)
  const [visibleCount, setVisibleCount] = React.useState(itemCount)

  const recalculate = React.useCallback(() => {
    const container = containerRef.current
    const measure = measureRef.current
    if (!container || !measure || itemCount === 0) {
      setVisibleCount(itemCount)
      return
    }

    const chips = Array.from(
      measure.querySelectorAll<HTMLElement>("[data-measure-chip]")
    )
    if (chips.length === 0) {
      setVisibleCount(0)
      return
    }

    const moreEl = measure.querySelector<HTMLElement>("[data-measure-more]")
    const trailing = container.querySelector<HTMLElement>("[data-chip-trailing]")
    const styles = window.getComputedStyle(container)
    const padX =
      (Number.parseFloat(styles.paddingLeft) || 0) +
      (Number.parseFloat(styles.paddingRight) || 0)
    const trailingWidth = trailing?.getBoundingClientRect().width ?? 0
    const available = Math.max(
      0,
      container.clientWidth - padX - trailingWidth - INPUT_CARET_PX
    )

    const chipWidths = chips.map((chip) => chip.getBoundingClientRect().width)
    const moreWidthFor = (hidden: number) => {
      if (!moreEl || hidden <= 0) return 0
      moreEl.textContent = `+${hidden}`
      return Math.max(moreEl.getBoundingClientRect().width, 28)
    }

    let best = 0
    for (let count = 0; count <= itemCount; count += 1) {
      let used = 0
      for (let index = 0; index < count; index += 1) {
        used += chipWidths[index]! + (index > 0 ? CHIP_GAP_PX : 0)
      }
      const hidden = itemCount - count
      if (hidden > 0) {
        used += (count > 0 ? CHIP_GAP_PX : 0) + moreWidthFor(hidden)
      }
      if (used <= available + 0.5) {
        best = count
      } else {
        break
      }
    }

    setVisibleCount(best)
  }, [containerRef, itemCount])

  React.useLayoutEffect(() => {
    recalculate()
    // Second pass after layout/fonts settle (chip widths can be 0 on first paint).
    const frame = window.requestAnimationFrame(() => recalculate())
    return () => window.cancelAnimationFrame(frame)
  }, [recalculate, itemKey])

  React.useEffect(() => {
    const container = containerRef.current
    if (!container || typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(() => {
      window.requestAnimationFrame(() => recalculate())
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [containerRef, recalculate])

  return { visibleCount, measureRef }
}

function DisplayFieldsMenu({
  displayFields,
  selectedDisplayFields,
  onSelectedDisplayFieldsChange,
}: {
  displayFields: CriteriaLookupField[]
  selectedDisplayFields: string[]
  onSelectedDisplayFieldsChange: (fieldKey: string) => void
}) {
  if (displayFields.length <= 1) return null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <InputGroupButton
          variant="ghost"
          size="icon-xs"
          aria-label="Display fields"
          className="text-muted-foreground hover:text-foreground"
          onMouseDown={(event) => event.preventDefault()}
        >
          <MoreHorizontal />
        </InputGroupButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={8}
        alignOffset={-4}
        className="min-w-40"
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel>Display fields</DropdownMenuLabel>
          {displayFields.map((field) => {
            const selected = selectedDisplayFields.includes(field.key)
            return (
              <DropdownMenuItem
                key={field.key}
                className={cn(selected && "bg-accent")}
                onClick={() => onSelectedDisplayFieldsChange(field.key)}
              >
                {field.title}
              </DropdownMenuItem>
            )
          })}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
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

  const popover = (
    <PopoverContent
      align="start"
      side="bottom"
      sideOffset={0}
      onOpenAutoFocus={(event) => event.preventDefault()}
      onCloseAutoFocus={(event) => event.preventDefault()}
      onPointerDownOutside={(event) => {
        if (isInsideAnchor(event.target)) {
          event.preventDefault()
        }
      }}
      onFocusOutside={(event) => {
        if (isInsideAnchor(event.target)) {
          event.preventDefault()
        }
      }}
      onInteractOutside={(event) => {
        if (isInsideAnchor(event.target)) {
          event.preventDefault()
        }
      }}
      style={width ? { width, minWidth: width, maxWidth: width } : undefined}
      className="w-auto max-w-none gap-0 rounded-md p-1 shadow-md ring-1 ring-border"
    >
      <Command
        shouldFilter={false}
        value={activeValue}
        onValueChange={(next) => {
          const index = filtered.findIndex((option) => option.value === next)
          if (index >= 0) setActiveIndex(index)
        }}
        className="rounded-md bg-transparent p-0"
      >
        <CommandList ref={listRef} className="max-h-56">
          <CommandEmpty className="py-3 text-xs">No results.</CommandEmpty>
          <CommandGroup className="p-0">
            {filtered.map((option) => {
              const checked = selectedValues.includes(option.value)
              return (
                <CommandItem
                  key={option.value}
                  value={option.value}
                  data-option-value={option.value}
                  data-checked={checked || undefined}
                  className="rounded-md px-2.5 py-1.5 text-xs"
                  onSelect={() => selectOption(option)}
                >
                  {option.label}
                </CommandItem>
              )
            })}
          </CommandGroup>
        </CommandList>
        {multiple && selectedValues.length > 0 ? (
          <>
            <CommandSeparator />
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-xs text-foreground hover:bg-muted"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                setQuery("")
                setOpen(false)
              }}
            >
              Done ({selectedValues.length})
            </button>
          </>
        ) : null}
        {showAdvancedSearch ? (
          <>
            <CommandSeparator />
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-xs text-foreground hover:bg-muted"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onAdvancedSearch?.()
                setOpen(false)
              }}
            >
              <Search className="size-3.5 text-muted-foreground" />
              Advanced Search
            </button>
          </>
        ) : null}
      </Command>
    </PopoverContent>
  )

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
          <div
            ref={anchorRef}
            data-grid-cell={dataGridCell}
            aria-invalid={ariaInvalid || undefined}
            className={cn(
              "relative flex h-7 min-h-7 w-full flex-nowrap items-center gap-1 overflow-hidden pl-2 pr-1 py-0.5",
              "rounded-none border border-transparent bg-transparent",
              "focus-within:border-border focus-within:bg-background",
              ariaInvalid && "border-destructive focus-within:border-destructive",
              className,
              "h-7 min-h-7 pl-2 pr-1 py-0.5"
            )}
            onClick={() => inputRef.current?.focus()}
          >
            <div
              ref={measureRef}
              aria-hidden
              className="pointer-events-none fixed top-0 left-[-9999px] z-[-1] flex items-center gap-1 whitespace-nowrap"
            >
              {selectedItems.map((item) => (
                <span
                  key={`measure-${item.value}`}
                  data-measure-chip
                  className={chipClass}
                >
                  <span className="truncate">{item.label}</span>
                  <span className="size-4 shrink-0" />
                </span>
              ))}
              <span data-measure-more className={chipClass}>
                +0
              </span>
            </div>

            {visibleItems.map((item) => (
              <span key={item.value} className={chipClass} data-slot="combobox-chip">
                <span className="truncate">{item.label}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  tabIndex={-1}
                  aria-label={`Remove ${item.label}`}
                  className="-ml-1 size-4 opacity-50 hover:opacity-100"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={(event) => {
                    event.stopPropagation()
                    removeChip(item.value)
                  }}
                >
                  <X className="size-3" />
                </Button>
              </span>
            ))}
            {hiddenCount > 0 ? (
              <button
                type="button"
                tabIndex={-1}
                className={cn(chipClass, "hover:bg-muted-foreground/15")}
                aria-label={`${hiddenCount} more selected`}
                onMouseDown={(event) => event.preventDefault()}
                onClick={(event) => {
                  event.stopPropagation()
                  openDropdown("")
                  inputRef.current?.focus()
                }}
              >
                +{hiddenCount}
              </button>
            ) : null}
            <input
              ref={inputRef}
              value={query}
              placeholder={selectedItems.length === 0 ? placeholder : undefined}
              aria-invalid={ariaInvalid}
              className="min-w-6 flex-1 bg-transparent text-xs/relaxed outline-none placeholder:text-muted-foreground/70 md:text-xs/relaxed"
              onChange={(event) => openDropdown(event.target.value)}
              onFocus={() => {
                setFocused(true)
                openDropdown(query)
              }}
              onBlur={() => setFocused(false)}
              onKeyDown={handleInputKeyDown}
              autoComplete="off"
            />
            <div
              data-chip-trailing
              className="ml-auto flex shrink-0 items-center gap-0 -mr-[0.275rem]"
            >
              {focused && selectedValues.length > 0 ? (
                <InputGroupButton
                  variant="ghost"
                  size="icon-xs"
                  tabIndex={-1}
                  aria-label="Clear"
                  className="text-muted-foreground hover:text-foreground"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={(event) => {
                    event.stopPropagation()
                    clearValue()
                  }}
                >
                  <X />
                </InputGroupButton>
              ) : null}
              {displayMenu}
            </div>
          </div>
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
      {popover}
    </Popover>
  )
}
