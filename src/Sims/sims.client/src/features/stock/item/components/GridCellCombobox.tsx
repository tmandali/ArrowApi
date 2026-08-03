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
import { Search } from "lucide-react"
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
  const anchorRef = React.useRef<HTMLDivElement>(null)
  const ignoreCloseRef = React.useRef(false)

  const filtered = React.useMemo(() => {
    const query = value.trim().toLowerCase()
    if (!query) return options
    return options.filter((option) => option.toLowerCase().includes(query))
  }, [options, value])

  const isInsideAnchor = (target: EventTarget | null) =>
    target instanceof Node && !!anchorRef.current?.contains(target)

  const openDropdown = () => {
    setWidth(anchorRef.current?.offsetWidth)
    ignoreCloseRef.current = true
    setOpen(true)
    window.setTimeout(() => {
      ignoreCloseRef.current = false
    }, 0)
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (!next && ignoreCloseRef.current) return
        setOpen(next)
      }}
    >
      <PopoverAnchor asChild>
        <div ref={anchorRef} className="w-full">
          <Input
            value={value}
            placeholder={placeholder}
            data-grid-cell={dataGridCell}
            onChange={(event) => {
              onChange(event.target.value)
              openDropdown()
            }}
            onFocus={openDropdown}
            onKeyDown={(event) => {
              if (event.key === "Tab" || event.key === "Escape") {
                ignoreCloseRef.current = false
                setOpen(false)
              }
            }}
            className={cn(className)}
            autoComplete="off"
          />
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
