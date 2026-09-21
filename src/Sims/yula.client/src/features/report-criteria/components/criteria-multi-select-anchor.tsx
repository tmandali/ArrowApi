import * as React from "react"
import { Button } from "@/components/ui/button"
import { InputGroupButton } from "@/components/ui/input-group"
import { X } from "lucide-react"
import { cn } from "@/utils/cn"
import { chipClass } from "./use-fit-chip-count"

export interface CriteriaMultiSelectAnchorProps {
  anchorRef: React.RefObject<HTMLDivElement | null>
  measureRef: React.RefObject<HTMLDivElement | null>
  inputRef: React.RefObject<HTMLInputElement | null>
  dataGridCell?: string
  ariaInvalid?: boolean
  className?: string
  selectedItems: Array<{ value: string; label: string }>
  visibleItems: Array<{ value: string; label: string }>
  hiddenCount: number
  selectedValues: string[]
  query: string
  placeholder?: string
  focused: boolean
  displayMenu: React.ReactNode
  onRemoveChip: (value: string) => void
  onOpenDropdown: (query: string) => void
  onSetFocused: (focused: boolean) => void
  onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void
  onClearValue: () => void
}

export function CriteriaMultiSelectAnchor({
  anchorRef,
  measureRef,
  inputRef,
  dataGridCell,
  ariaInvalid,
  className,
  selectedItems,
  visibleItems,
  hiddenCount,
  selectedValues,
  query,
  placeholder,
  focused,
  displayMenu,
  onRemoveChip,
  onOpenDropdown,
  onSetFocused,
  onKeyDown,
  onClearValue,
}: CriteriaMultiSelectAnchorProps) {
  return (
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
              onRemoveChip(item.value)
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
            onOpenDropdown("")
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
        onChange={(event) => onOpenDropdown(event.target.value)}
        onFocus={() => {
          onSetFocused(true)
          onOpenDropdown(query)
        }}
        onBlur={() => onSetFocused(false)}
        onKeyDown={onKeyDown}
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
              onClearValue()
            }}
          >
            <X />
          </InputGroupButton>
        ) : null}
        {displayMenu}
      </div>
    </div>
  )
}
