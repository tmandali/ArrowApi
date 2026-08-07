import * as React from "react"
import { Input } from "@/components/ui/input"
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
import { Search, X } from "lucide-react"
import { cn } from "@/utils/cn"
import type { CriteriaComboboxOption } from "../types"
import {
  joinMultiValue,
  splitMultiValue,
  toggleMultiValue,
} from "../lib/multi-value"

function normalizeOptions(
  options: Array<string | CriteriaComboboxOption>
): CriteriaComboboxOption[] {
  return options.map((option) =>
    typeof option === "string" ? { value: option, label: option } : option
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
}: CriteriaGridCellComboboxProps) {
  const [open, setOpen] = React.useState(false)
  const [width, setWidth] = React.useState<number>()
  const [query, setQuery] = React.useState("")
  const [focused, setFocused] = React.useState(false)
  const anchorRef = React.useRef<HTMLDivElement>(null)
  const ignoreCloseRef = React.useRef(false)

  const normalized = React.useMemo(
    () => normalizeOptions(options),
    [options]
  )

  const selectedValues = React.useMemo(
    () => (multiple ? splitMultiValue(value) : value ? [value] : []),
    [multiple, value]
  )

  const displayValue = React.useMemo(() => {
    if (multiple) {
      return selectedValues
        .map(
          (selected) =>
            normalized.find((option) => option.value === selected)?.label ??
            selected
        )
        .join(", ")
    }
    const match = normalized.find((option) => option.value === value)
    return match?.label ?? value
  }, [multiple, normalized, selectedValues, value])

  const filtered = React.useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    if (!normalizedQuery) return normalized
    return normalized.filter(
      (option) =>
        option.label.toLowerCase().includes(normalizedQuery) ||
        option.value.toLowerCase().includes(normalizedQuery)
    )
  }, [normalized, query])

  const isInsideAnchor = (target: EventTarget | null) =>
    target instanceof Node && !!anchorRef.current?.contains(target)

  const getInput = () =>
    anchorRef.current?.querySelector<HTMLInputElement>("input")

  const openDropdown = (nextQuery = "") => {
    const measured = anchorRef.current?.offsetWidth ?? 0
    setWidth(measured > 0 ? measured : undefined)
    setQuery(nextQuery)
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
    getInput()?.focus()
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
        <div ref={anchorRef} className="relative w-full">
          <Input
            value={open ? query : displayValue}
            placeholder={placeholder}
            data-grid-cell={dataGridCell}
            aria-invalid={ariaInvalid}
            onChange={(event) => {
              const next = event.target.value
              if (multiple) {
                openDropdown(next)
                return
              }
              onChange(next)
              openDropdown(next)
            }}
            onFocus={(event) => {
              setFocused(true)
              openDropdown("")
              event.currentTarget.select()
            }}
            onBlur={() => setFocused(false)}
            onKeyDown={(event) => {
              if (event.key === "Tab" || event.key === "Escape") {
                ignoreCloseRef.current = false
                setQuery("")
                setOpen(false)
              }
            }}
            className={cn(
              focused && value ? "pr-7" : undefined,
              ariaInvalid &&
                "border-destructive focus-visible:border-destructive",
              className
            )}
            autoComplete="off"
          />
          {focused && value ? (
            <button
              type="button"
              tabIndex={-1}
              aria-label="Clear"
              className="absolute right-1.5 top-1/2 z-10 flex size-5 -translate-y-1/2 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground"
              onMouseDown={(event) => event.preventDefault()}
              onClick={clearValue}
            >
              <X className="size-3.5" />
            </button>
          ) : null}
        </div>
      </PopoverAnchor>
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
        <Command shouldFilter={false} className="rounded-md bg-transparent p-0">
          <CommandList className="max-h-56">
            <CommandEmpty className="py-3 text-xs">No results.</CommandEmpty>
            <CommandGroup className="p-0">
              {filtered.map((option) => {
                const checked = selectedValues.includes(option.value)
                return (
                  <CommandItem
                    key={option.value}
                    value={option.value}
                    data-checked={checked || undefined}
                    className="rounded-md px-2.5 py-1.5 text-xs"
                    onSelect={() => {
                      if (multiple) {
                        onChange(toggleMultiValue(value, option.value))
                        setQuery("")
                        return
                      }
                      onChange(option.value)
                      setQuery("")
                      setOpen(false)
                    }}
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
                  onChange(joinMultiValue(selectedValues))
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
    </Popover>
  )
}
