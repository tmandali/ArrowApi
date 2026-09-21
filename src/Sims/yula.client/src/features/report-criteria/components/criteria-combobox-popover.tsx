import * as React from "react"
import { Search } from "lucide-react"
import { PopoverContent } from "@/components/ui/popover"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command"
import type { CriteriaComboboxOption } from "../types"

export interface CriteriaComboboxPopoverProps {
  width?: number
  activeValue: string
  filtered: CriteriaComboboxOption[]
  selectedValues: string[]
  multiple: boolean
  showAdvancedSearch: boolean
  listRef: React.RefObject<HTMLDivElement | null>
  isInsideAnchor: (target: EventTarget | null) => boolean
  onSelectOption: (option: CriteriaComboboxOption) => void
  onActiveChange: (value: string) => void
  onDone: () => void
  onAdvancedSearch?: () => void
}

export function CriteriaComboboxPopover({
  width,
  activeValue,
  filtered,
  selectedValues,
  multiple,
  showAdvancedSearch,
  listRef,
  isInsideAnchor,
  onSelectOption,
  onActiveChange,
  onDone,
  onAdvancedSearch,
}: CriteriaComboboxPopoverProps) {
  return (
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
        onValueChange={onActiveChange}
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
                  onSelect={() => onSelectOption(option)}
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
              onClick={onDone}
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
              onClick={onAdvancedSearch}
            >
              <Search className="size-3.5 text-muted-foreground" />
              Advanced Search
            </button>
          </>
        ) : null}
      </Command>
    </PopoverContent>
  )
}
