import * as React from "react"
import type { DateRange } from "react-day-picker"
import { CalendarIcon, X } from "lucide-react"
import { Calendar } from "@/components/ui/calendar"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/utils/cn"
import type { CriteriaFieldDef } from "../types"

function pad2(value: number): string {
  return String(value).padStart(2, "0")
}

/** Serialize to YYYYMMDD (schema date compact form). */
function toCompactDate(date: Date): string {
  return `${date.getFullYear()}${pad2(date.getMonth() + 1)}${pad2(date.getDate())}`
}

function parseCompactDate(value: string): Date | undefined {
  if (!/^\d{8}$/.test(value)) return undefined
  const year = Number(value.slice(0, 4))
  const month = Number(value.slice(4, 6)) - 1
  const day = Number(value.slice(6, 8))
  const date = new Date(year, month, day)
  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month ||
    date.getDate() !== day
  ) {
    return undefined
  }
  return date
}

function parseIsoDate(value: string): Date | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined
  const [yearText, monthText, dayText] = value.split("-")
  const year = Number(yearText)
  const month = Number(monthText) - 1
  const day = Number(dayText)
  const date = new Date(year, month, day)
  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month ||
    date.getDate() !== day
  ) {
    return undefined
  }
  return date
}

function parseDateToken(value: string): Date | undefined {
  return parseCompactDate(value) ?? parseIsoDate(value)
}

function formatDateToken(date: Date, compact: boolean): string {
  if (compact) return toCompactDate(date)
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

function parseRangeValue(value: string): DateRange | undefined {
  const trimmed = value.trim()
  if (!trimmed) return undefined
  if (trimmed.includes("..")) {
    const [fromText, toText] = trimmed.split("..")
    const from = parseDateToken(fromText?.trim() ?? "")
    const to = parseDateToken(toText?.trim() ?? "")
    if (!from && !to) return undefined
    return { from, to }
  }
  const single = parseDateToken(trimmed)
  return single ? { from: single, to: undefined } : undefined
}

const cellFrameClass =
  "h-9 min-h-9 w-full rounded-none border border-transparent bg-transparent p-0 shadow-none ring-0 " +
  "focus-within:border-border focus-within:bg-background focus-within:ring-0 " +
  "has-[[data-slot=input-group-control]:focus-visible]:border-border " +
  "has-[[data-slot=input-group-control]:focus-visible]:ring-0 " +
  "[&_[data-slot=input-group-control]]:h-9 [&_[data-slot=input-group-control]]:px-2 [&_[data-slot=input-group-control]]:py-0 [&_[data-slot=input-group-control]]:text-xs/relaxed " +
  "[&_[data-slot=input-group-addon]]:py-0 [&_[data-slot=input-group-addon]]:pr-1 " +
  "dark:bg-transparent px-0"

const formFrameClass =
  "h-9 min-h-9 w-full rounded-md border border-muted-foreground/20 bg-muted/30 shadow-none " +
  "focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30 " +
  "[&_[data-slot=input-group-control]]:h-9 [&_[data-slot=input-group-control]]:text-xs/relaxed " +
  "[&_[data-slot=input-group-addon]]:py-0 [&_[data-slot=input-group-addon]]:pr-1 " +
  "dark:bg-muted/30"

type CriteriaDateValueCellProps = {
  field: CriteriaFieldDef
  value: string
  onChange: (value: string) => void
  className?: string
  "data-grid-cell"?: string
  invalid?: boolean
  variant?: "cell" | "form"
  placeholder?: string
}

export function CriteriaDateValueCell({
  field,
  value,
  onChange,
  className,
  "data-grid-cell": dataGridCell,
  invalid = false,
  variant = "cell",
  placeholder,
}: CriteriaDateValueCellProps) {
  const [open, setOpen] = React.useState(false)
  const [focused, setFocused] = React.useState(false)
  const allowsRange = field.dateMode === "range"
  const useCompact = true

  const selectedRange = React.useMemo(() => parseRangeValue(value), [value])
  const selectedSingle = selectedRange?.from
  const showClear = focused && value.trim().length > 0

  const commitSingle = (date: Date | undefined) => {
    if (!date) {
      onChange("")
      return
    }
    onChange(formatDateToken(date, useCompact))
    setOpen(false)
  }

  const commitRange = (range: DateRange | undefined) => {
    if (!range?.from) {
      onChange("")
      return
    }
    if (!range.to || range.to.getTime() === range.from.getTime()) {
      onChange(formatDateToken(range.from, useCompact))
      return
    }
    onChange(
      `${formatDateToken(range.from, useCompact)}..${formatDateToken(range.to, useCompact)}`
    )
  }

  return (
    <InputGroup
      data-grid-cell={dataGridCell}
      aria-invalid={invalid || undefined}
      className={cn(
        variant === "cell" ? cellFrameClass : formFrameClass,
        invalid &&
          "border-destructive focus-within:border-destructive has-[[data-slot=input-group-control]:focus-visible]:border-destructive",
        className,
        variant === "cell" && "px-0 py-0"
      )}
    >
      <InputGroupInput
        value={value}
        placeholder={placeholder}
        aria-invalid={invalid || undefined}
        onChange={(event) => onChange(event.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        className="md:text-xs/relaxed"
      />
      <InputGroupAddon align="inline-end" className="gap-0">
        {showClear ? (
          <InputGroupButton
            type="button"
            variant="ghost"
            size="icon-xs"
            tabIndex={-1}
            aria-label={`Clear ${field.title}`}
            className="text-muted-foreground hover:text-foreground"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              onChange("")
              setOpen(false)
            }}
          >
            <X />
          </InputGroupButton>
        ) : null}
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <InputGroupButton
              type="button"
              variant="ghost"
              size="icon-xs"
              tabIndex={-1}
              aria-label={`Pick ${field.title}`}
              className="text-muted-foreground hover:text-foreground"
              onMouseDown={(event) => event.preventDefault()}
            >
              <CalendarIcon />
            </InputGroupButton>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="end">
            {allowsRange ? (
              <Calendar
                mode="range"
                selected={selectedRange}
                onSelect={(range) => {
                  commitRange(range)
                  if (range?.from && range?.to) setOpen(false)
                }}
                numberOfMonths={1}
                defaultMonth={selectedRange?.from}
              />
            ) : (
              <Calendar
                mode="single"
                selected={selectedSingle}
                onSelect={commitSingle}
                defaultMonth={selectedSingle}
              />
            )}
          </PopoverContent>
        </Popover>
      </InputGroupAddon>
    </InputGroup>
  )
}
