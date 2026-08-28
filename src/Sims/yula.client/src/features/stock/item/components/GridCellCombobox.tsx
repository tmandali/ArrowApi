"use client";

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

type GridCellComboboxProps = {
  value: string
  onChange: (value: string) => void
  options: string[]
  placeholder?: string
  className?: string
  onAdvancedSearch?: () => void
  "data-grid-cell"?: string
}

export function GridCellCombobox({
  value,
  onChange,
  options,
  placeholder,
  className,
  onAdvancedSearch,
  "data-grid-cell": dataGridCell,
}: GridCellComboboxProps) {
  const [open, setOpen] = React.useState(false)
  const [width, setWidth] = React.useState<number>()
  const [query, setQuery] = React.useState("")
  const [focused, setFocused] = React.useState(false)
  const anchorRef = React.useRef<HTMLDivElement>(null)
  const ignoreCloseRef = React.useRef(false)

  const filtered = React.useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return options
    return options.filter((option) =>
      option.toLowerCase().includes(normalized)
    )
  }, [options, query])

  const isInsideAnchor = (target: EventTarget | null) =>
    target instanceof Node && !!anchorRef.current?.contains(target)

  const getInput = () =>
    anchorRef.current?.querySelector<HTMLInputElement>("input")

  const openDropdown = (nextQuery = "") => {
    setWidth(anchorRef.current?.offsetWidth)
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
            value={value}
            placeholder={placeholder}
            data-grid-cell={dataGridCell}
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
            onKeyDown={(event) => {
              if (event.key === "Tab" || event.key === "Escape") {
                ignoreCloseRef.current = false
                setQuery("")
                setOpen(false)
              }
            }}
            className={cn(focused && value ? "pr-7" : undefined, className)}
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
        style={width ? { width } : undefined}
        className="gap-0 rounded-md p-1 shadow-md ring-1 ring-border"
      >
        <Command shouldFilter={false} className="rounded-md bg-transparent p-0">
          <CommandList className="max-h-56">
            <CommandEmpty className="py-3 text-xs">No results.</CommandEmpty>
            <CommandGroup className="p-0">
              {filtered.map((option) => (
                <CommandItem
                  key={option}
                  value={option}
                  data-checked={value === option || undefined}
                  className="rounded-md px-2.5 py-1.5 text-xs"
                  onSelect={() => {
                    onChange(option)
                    setQuery("")
                    setOpen(false)
                  }}
                >
                  {option}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
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
        </Command>
      </PopoverContent>
    </Popover>
  )
}
