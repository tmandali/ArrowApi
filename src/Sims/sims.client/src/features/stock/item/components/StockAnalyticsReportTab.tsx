import * as React from "react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Calendar as CalendarComponent } from "@/components/ui/calendar"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Spinner } from "@/components/ui/spinner"
import {
  Avatar,
  AvatarFallback,
  AvatarGroup,
} from "@/components/ui/avatar"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command"
import {
  WorkspaceSidePanelLayout,
  WORKSPACE_SIDE_PANEL_PERCENT,
} from "@/components/layout/workspace-side-panel"
import { cn } from "@/utils/cn"
import { useStockAnalyticsReport } from "@/context/stock-analytics-report"
import type { ReportGridRow } from "../types/stock-analytics"
import {
  BookOpen,
  Calendar as CalendarIcon,
  CalendarRange,
  ChevronDown,
  CircleDollarSign,
  Layers,
  Play,
  Search,
  X,
  Check,
} from "lucide-react"

const cellInputClass =
  "h-7 w-full min-w-0 rounded-none border border-transparent bg-transparent px-2 py-0 text-xs shadow-none outline-none ring-0 transition-none focus-visible:border-border focus-visible:bg-background focus-visible:ring-0 md:text-xs/relaxed placeholder:text-muted-foreground/70"

const cellClass =
  "p-0 border-r border-b border-border/60 last:border-r-0 align-middle"
const headClass =
  "h-8 px-2 py-1.5 border-r border-b border-border/60 last:border-r-0 text-[11px] font-medium leading-tight text-muted-foreground bg-muted/40 align-middle"

/** Shared layout % — Filters panel and Account column stay aligned. */
const FILTERS_WIDTH_PERCENT = WORKSPACE_SIDE_PANEL_PERCENT
const ACCOUNT_COL_STYLE = { width: `${FILTERS_WIDTH_PERCENT}%` } as const

type FilterKey =
  | "values"
  | "fiscalYear"
  | "dateRange"
  | "financeBook"
  | "currency"

const filterCriteria: {
  key: FilterKey
  label: string
  icon: React.ComponentType<{ className?: string }>
  options: { value: string; label: string }[]
}[] = [
  {
    key: "values",
    label: "Values",
    icon: Layers,
    options: [
      { value: "5-values", label: "5 values selected" },
      { value: "all", label: "All Values" },
    ],
  },
  {
    key: "fiscalYear",
    label: "Fiscal Year",
    icon: CalendarRange,
    options: [
      { value: "2025-2026", label: "2025-2026" },
      { value: "2024-2025", label: "2024-2025" },
    ],
  },
  {
    key: "dateRange",
    label: "Date Range",
    icon: CalendarIcon,
    options: [
      { value: "fy-current", label: "Current Fiscal Year" },
      { value: "fy-prev", label: "Previous Fiscal Year" },
    ],
  },
  {
    key: "financeBook",
    label: "Finance Book",
    icon: BookOpen,
    options: [
      { value: "Main Book", label: "Main Book" },
      { value: "Tax Book", label: "Tax Book" },
    ],
  },
  {
    key: "currency",
    label: "Currency",
    icon: CircleDollarSign,
    options: [
      { value: "inr", label: "INR (₹)" },
      { value: "try", label: "TRY (₺)" },
      { value: "usd", label: "USD ($)" },
    ],
  },
]

const formatFilterDate = (date?: Date) =>
  date ? date.toLocaleDateString("en-GB").replace(/\//g, "-") : undefined

export type StockAnalyticsTreeAction =
  | { id: number; type: "expand-all" }
  | { id: number; type: "collapse-all" }
  | { id: number; type: "set-level"; level: number }

export function StockAnalyticsReportTab({
  filtersOpen: filtersOpenProp,
  onFiltersOpenChange,
  runReportToken = 0,
  treeAction = null,
  onReportReadyChange,
  showFilterRow = true,
}: {
  filtersOpen?: boolean
  onFiltersOpenChange?: (open: boolean) => void
  runReportToken?: number
  treeAction?: StockAnalyticsTreeAction | null
  onReportReadyChange?: (ready: boolean) => void
  showFilterRow?: boolean
} = {}) {
  const {
    expandedNodes,
    reportRows,
    reportColumns,
    runEvents,
    runStatus,
    reportReady,
    running,
    hasPendingReport,
    isPendingView,
    fromDate,
    setFromDate,
    toDate,
    setToDate,
    valuesMode,
    setValuesMode,
    fiscalYear,
    setFiscalYear,
    financeBook,
    setFinanceBook,
    currency,
    setCurrency,
    showZeroValues,
    setShowZeroValues,
    showGroupAccounts,
    setShowGroupAccounts,
    toggleNode,
    expandAll,
    collapseAll,
    setLevel,
    runReport,
    primaryActionLabel,
    primaryActionButtonProps,
    onPrimaryAction,
  } = useStockAnalyticsReport()

  const [internalFiltersOpen, setInternalFiltersOpen] = React.useState(true)
  const filtersOpen = filtersOpenProp ?? internalFiltersOpen
  const setFiltersOpen = onFiltersOpenChange ?? setInternalFiltersOpen
  const [activeFilter, setActiveFilter] = React.useState<FilterKey | null>(null)
  const [openPicker, setOpenPicker] = React.useState<FilterKey | null>(null)

  React.useEffect(() => {
    onReportReadyChange?.(reportReady)
  }, [reportReady, onReportReadyChange])

  React.useEffect(() => {
    if (runReportToken > 0) {
      void runReport()
    }
  }, [runReportToken, runReport])

  React.useEffect(() => {
    if (!treeAction) return
    if (treeAction.type === "expand-all") {
      expandAll()
      return
    }
    if (treeAction.type === "collapse-all") {
      collapseAll()
      return
    }
    setLevel(treeAction.level)
  }, [treeAction, expandAll, collapseAll, setLevel])

  const currencyLabel =
    currency === "try"
      ? "TRY (₺)"
      : currency === "usd"
        ? "USD ($)"
        : currency === "inr"
          ? "INR (₹)"
          : ""
  const valuesLabel =
    valuesMode === "all"
      ? "All Values"
      : valuesMode === "5-values"
        ? "5 values selected"
        : ""
  const dateRangeLabel = [formatFilterDate(fromDate), formatFilterDate(toDate)]
    .filter(Boolean)
    .join(" → ")

  const filterChips: Record<FilterKey, string[]> = {
    values: valuesLabel ? [valuesLabel] : [],
    fiscalYear: fiscalYear ? [fiscalYear] : [],
    dateRange: dateRangeLabel ? [dateRangeLabel] : [],
    financeBook: financeBook ? [financeBook] : [],
    currency: currencyLabel ? [currencyLabel] : [],
  }

  const selectedValue: Record<FilterKey, string> = {
    values: valuesMode,
    fiscalYear,
    dateRange: "",
    financeBook,
    currency,
  }

  const applyFilterOption = (key: FilterKey, value: string) => {
    switch (key) {
      case "values":
        setValuesMode(value)
        break
      case "fiscalYear":
        setFiscalYear(value)
        break
      case "dateRange":
        if (value === "fy-current") {
          setFromDate(new Date(2025, 3, 1))
          setToDate(new Date(2026, 2, 31))
        } else if (value === "fy-prev") {
          setFromDate(new Date(2024, 3, 1))
          setToDate(new Date(2025, 2, 31))
        }
        break
      case "financeBook":
        setFinanceBook(value)
        break
      case "currency":
        setCurrency(value)
        break
      default: {
        const _exhaustive: never = key
        return _exhaustive
      }
    }
  }

  const clearFilter = (key: FilterKey) => {
    switch (key) {
      case "values":
        setValuesMode("")
        break
      case "fiscalYear":
        setFiscalYear("")
        break
      case "dateRange":
        setFromDate(undefined)
        setToDate(undefined)
        break
      case "financeBook":
        setFinanceBook("")
        break
      case "currency":
        setCurrency("")
        break
      default: {
        const _exhaustive: never = key
        return _exhaustive
      }
    }
  }

  const activeFilterMeta = filterCriteria.find((c) => c.key === activeFilter)

  const showGrid = reportReady && runStatus === "idle" && reportColumns.length > 0
  const showRunSteps =
    runStatus === "running" ||
    runStatus === "cancelled" ||
    isPendingView

  const renderRows = (rows: ReportGridRow[], depth = 0): React.ReactNode =>
    rows.map((row) => {
      const hasChildren = !!row.children?.length
      const isExpanded = !!expandedNodes[row.id]

      return (
        <React.Fragment key={row.id}>
          <tr className="hover:bg-muted/30 text-xs">
            {reportColumns.map((col) => {
              if (col.kind === "account") {
                return (
                  <td key={col.name} className={cellClass}>
                    <div
                      className="flex h-7 items-center gap-1.5 px-2 whitespace-nowrap"
                      style={{ paddingLeft: `${8 + depth * 16}px` }}
                    >
                      {hasChildren ? (
                        <button
                          type="button"
                          onClick={() => toggleNode(row.id)}
                          className="size-4 inline-flex shrink-0 items-center justify-center rounded hover:bg-muted text-muted-foreground"
                        >
                          <ChevronDown
                            className={cn(
                              "size-3.5 transition-transform",
                              !isExpanded && "-rotate-90"
                            )}
                          />
                        </button>
                      ) : (
                        <span className="size-4 inline-block shrink-0" />
                      )}
                      <span
                        className={cn(
                          "truncate font-medium",
                          hasChildren
                            ? "font-semibold text-foreground"
                            : "text-muted-foreground"
                        )}
                      >
                        {row.name}
                      </span>
                    </div>
                  </td>
                )
              }

              return (
                <td key={col.name} className={cellClass}>
                  <div
                    className={cn(
                      "flex h-7 items-center justify-end px-2 whitespace-nowrap",
                      col.name === "Debit" || col.name === "ClosingDr"
                        ? "font-medium"
                        : "text-muted-foreground"
                    )}
                  >
                    {row.values[col.name] ?? "—"}
                  </div>
                </td>
              )
            })}
          </tr>
          {hasChildren && isExpanded
            ? renderRows(row.children!, depth + 1)
            : null}
        </React.Fragment>
      )
    })

  const queryPanel = (
    <>
      <ScrollArea className="h-0 min-h-0 flex-1">
        <div className="py-1">
          {filterCriteria.map((criterion) => {
            const Icon = criterion.icon
            const chips = filterChips[criterion.key]
            const isOpen = openPicker === criterion.key
            return (
              <div key={criterion.key} className="px-1">
                <Popover
                  open={isOpen}
                  onOpenChange={(open) =>
                    setOpenPicker(open ? criterion.key : null)
                  }
                >
                  <PopoverAnchor asChild>
                    <button
                      type="button"
                      onClick={() =>
                        setOpenPicker(isOpen ? null : criterion.key)
                      }
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted/50"
                    >
                      <Icon className="size-3.5 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate text-foreground">
                        {criterion.label}
                      </span>
                    </button>
                  </PopoverAnchor>
                  <PopoverContent
                    align="start"
                    side="bottom"
                    sideOffset={4}
                    className="w-56 gap-0 rounded-md p-1 shadow-md ring-1 ring-border"
                  >
                    <Command className="rounded-md bg-transparent p-0">
                      <CommandList className="max-h-56">
                        <CommandEmpty className="py-3 text-xs">
                          No results.
                        </CommandEmpty>
                        <CommandGroup className="p-0">
                          {criterion.options.map((option) => (
                            <CommandItem
                              key={option.value}
                              value={option.label}
                              data-checked={
                                selectedValue[criterion.key] ===
                                  option.value || undefined
                              }
                              className="rounded-md px-2.5 py-1.5 text-xs"
                              onSelect={() => {
                                applyFilterOption(
                                  criterion.key,
                                  option.value
                                )
                                setOpenPicker(null)
                              }}
                            >
                              {option.label}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                      <CommandSeparator />
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-xs text-foreground hover:bg-muted"
                        onClick={() => {
                          setOpenPicker(null)
                          setActiveFilter(criterion.key)
                        }}
                      >
                        <Search className="size-3.5 text-muted-foreground" />
                        Advanced Search
                      </button>
                    </Command>
                  </PopoverContent>
                </Popover>
                {chips.length > 0 ? (
                  <div className="space-y-0.5 pb-1 pl-7 pr-1">
                    {chips.map((chip) => (
                      <div
                        key={chip}
                        className="group flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs text-muted-foreground hover:bg-muted/40"
                      >
                        <span className="min-w-0 flex-1 truncate">
                          {chip}
                        </span>
                        <button
                          type="button"
                          aria-label={`Clear ${criterion.label}`}
                          className="inline-flex size-4 shrink-0 items-center justify-center rounded text-muted-foreground/70 opacity-70 transition-opacity hover:text-foreground group-hover:opacity-100"
                          onClick={() => clearFilter(criterion.key)}
                        >
                          <X className="size-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            )
          })}

          <Separator className="my-2" />

          <div className="space-y-2.5 px-3 py-1">
            <div className="flex items-start gap-2">
              <Checkbox
                id="sa-show-zero"
                checked={showZeroValues}
                onCheckedChange={(checked) =>
                  setShowZeroValues(!!checked)
                }
              />
              <Label
                htmlFor="sa-show-zero"
                className="cursor-pointer text-xs font-normal leading-snug"
              >
                Show zero values
              </Label>
            </div>
            <div className="flex items-start gap-2">
              <Checkbox
                id="sa-show-group"
                checked={showGroupAccounts}
                onCheckedChange={(checked) =>
                  setShowGroupAccounts(!!checked)
                }
              />
              <Label
                htmlFor="sa-show-group"
                className="cursor-pointer text-xs font-normal leading-snug"
              >
                Show Group Accounts
              </Label>
            </div>
          </div>
        </div>
      </ScrollArea>

      <div className="shrink-0 border-t p-3">
        <Button
          type="button"
          className={cn(
            "h-8 w-full gap-1.5 text-xs",
            primaryActionButtonProps.className
          )}
          variant={primaryActionButtonProps.variant}
          onClick={onPrimaryAction}
        >
          {runStatus === "running" ? (
            <X className="size-3.5" />
          ) : isPendingView ? (
            <Check className="size-3.5" />
          ) : (
            <Play className="size-3.5" />
          )}
          {primaryActionLabel}
        </Button>
      </div>
    </>
  )

  return (
    <>
    <WorkspaceSidePanelLayout
      open={filtersOpen}
      onOpenChange={setFiltersOpen}
      title="Query"
      collapseLabel="Collapse filters"
      panel={queryPanel}
    >
        <div className="flex h-full min-h-0 flex-col overflow-hidden p-4 gap-3">
          {showGrid ? (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border bg-card">
              <div className="shrink-0 border-b">
                <table className="w-full table-fixed caption-bottom border-separate border-spacing-0 text-xs">
                  <colgroup>
                    {reportColumns.map((col) => (
                      <col
                        key={col.name}
                        style={
                          col.kind === "account" ? ACCOUNT_COL_STYLE : undefined
                        }
                      />
                    ))}
                  </colgroup>
                  <thead>
                    <tr>
                      {reportColumns.map((col) => (
                        <th
                          key={col.name}
                          className={cn(
                            headClass,
                            col.align === "left" ? "text-left" : "text-right"
                          )}
                        >
                          {col.label}
                        </th>
                      ))}
                    </tr>
                    {showFilterRow ? (
                    <tr className="bg-muted/10">
                      {reportColumns.map((col, index) => (
                        <th key={col.name} className={cellClass}>
                          <Input
                            className={cn(
                              cellInputClass,
                              index > 0 && "text-right"
                            )}
                            placeholder={index === 0 ? "Filter…" : undefined}
                          />
                        </th>
                      ))}
                    </tr>
                    ) : null}
                  </thead>
                </table>
              </div>

              <ScrollArea className="h-0 min-h-0 w-full flex-1">
                <table className="w-full table-fixed caption-bottom border-separate border-spacing-0 text-xs">
                  <colgroup>
                    {reportColumns.map((col) => (
                      <col
                        key={col.name}
                        style={
                          col.kind === "account" ? ACCOUNT_COL_STYLE : undefined
                        }
                      />
                    ))}
                  </colgroup>
                  <tbody>{renderRows(reportRows)}</tbody>
                </table>
              </ScrollArea>
            </div>
          ) : showRunSteps ? (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <div className="flex shrink-0 items-center justify-between gap-4 px-1 pb-3">
                <div className="min-w-0 space-y-0.5">
                  <p className="text-sm font-semibold tracking-tight">
                    {runStatus === "cancelled"
                      ? "Report cancelled"
                      : isPendingView
                        ? "Report ready"
                        : "Running Stock Analytics"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Arrow job · live SSE
                  </p>
                </div>
              </div>

              <ScrollArea className="h-0 min-h-0 w-full flex-1">
                <div className="flex flex-col gap-2.5 px-1 pr-3 pb-2">
                  {runEvents.map((step, index) => {
                    const isCurrent = index === runEvents.length - 1
                    const isComplete =
                      isPendingView ||
                      (runStatus === "running" && !isCurrent) ||
                      (runStatus === "cancelled" && !isCurrent)
                    const isCancelledHere =
                      runStatus === "cancelled" && isCurrent
                    const isFailedHere =
                      step.tone === "danger" && isCurrent
                    const isProgress = step.eventName === "progress"

                    const titleClass = isCancelledHere || isFailedHere
                      ? "font-medium text-amber-500"
                      : isComplete || (isCurrent && step.tone === "success")
                        ? "font-medium text-emerald-600"
                        : isCurrent
                          ? "text-foreground"
                          : "text-muted-foreground/70"

                    const iconClass = isCancelledHere || isFailedHere
                      ? "text-amber-500"
                      : isComplete || (isCurrent && step.tone === "success")
                        ? "text-emerald-600"
                        : "text-muted-foreground"

                    return (
                      <div
                        key={step.id}
                        className="flex items-start gap-2.5"
                      >
                        <div className="mt-0.5 flex size-4 shrink-0 items-center justify-center">
                          {runStatus === "running" && isCurrent ? (
                            <Spinner
                              className={cn("size-3.5", iconClass)}
                            />
                          ) : isComplete && !isCancelledHere && !isFailedHere ? (
                            <Check
                              className={cn("size-3.5", iconClass)}
                            />
                          ) : isCancelledHere || isFailedHere ? (
                            <X className={cn("size-3.5", iconClass)} />
                          ) : (
                            <span className="size-1.5 rounded-full bg-muted-foreground/35" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline justify-between gap-3">
                            <span className={cn("text-sm", titleClass)}>
                              {step.title}
                            </span>
                            {isProgress ? (
                              <span className="tabular-nums text-sm font-medium text-foreground">
                                {step.detail}
                              </span>
                            ) : null}
                          </div>
                          {!isProgress ? (
                            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                              {step.detail}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </ScrollArea>
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 items-center justify-center p-6">
              <Empty className="max-w-md border rounded-xl bg-card p-10">
                <EmptyHeader>
                  <EmptyMedia>
                    <AvatarGroup className="*:data-[slot=avatar]:size-12 *:data-[slot=avatar]:grayscale-[0.35] hover:*:data-[slot=avatar]:grayscale-0">
                      <Avatar>
                        <AvatarFallback className="bg-primary/10 text-primary">
                          <Layers className="size-5" />
                        </AvatarFallback>
                      </Avatar>
                      <Avatar>
                        <AvatarFallback className="bg-emerald-500/10 text-emerald-600">
                          <BookOpen className="size-5" />
                        </AvatarFallback>
                      </Avatar>
                      <Avatar>
                        <AvatarFallback className="bg-amber-500/10 text-amber-600">
                          <CircleDollarSign className="size-5" />
                        </AvatarFallback>
                      </Avatar>
                    </AvatarGroup>
                  </EmptyMedia>
                  <EmptyTitle className="text-base font-semibold">
                    {hasPendingReport ? "Report ready" : "No report yet"}
                  </EmptyTitle>
                  <EmptyDescription>
                    {hasPendingReport
                      ? "Rapor tamamlandı. View ile sonuçları görüntüleyin."
                      : "Query panelinden filtreleri seçin ve Execute ile Stock Analytics raporunu Arrow job + SSE akışıyla üretin."}
                  </EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                  <Button
                    type="button"
                    size="sm"
                    className={cn(
                      "h-8 gap-1.5 text-xs",
                      primaryActionButtonProps.className
                    )}
                    variant={primaryActionButtonProps.variant}
                    onClick={onPrimaryAction}
                  >
                    {isPendingView ? (
                      <Check className="size-3.5" />
                    ) : (
                      <Play className="size-3.5" />
                    )}
                    {primaryActionLabel}
                  </Button>
                </EmptyContent>
              </Empty>
            </div>
          )}
        </div>
    </WorkspaceSidePanelLayout>

      <Dialog
        open={activeFilter !== null}
        onOpenChange={(open) => {
          if (!open) setActiveFilter(null)
        }}
      >
        <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-md">
          <DialogHeader className="flex flex-row items-center justify-between gap-3 space-y-0 border-b px-4 py-3">
            <DialogTitle className="text-sm font-semibold">
              Advanced Search — {activeFilterMeta?.label ?? "Filter"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 p-4 text-xs">
            {activeFilter === "values" ? (
              <div className="space-y-1.5">
                <Label className="text-[11px] text-muted-foreground">
                  Values
                </Label>
                <Select value={valuesMode || undefined} onValueChange={setValuesMode}>
                  <SelectTrigger className="h-8 w-full text-xs">
                    <SelectValue placeholder="Select values" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="5-values">5 values selected</SelectItem>
                    <SelectItem value="all">All Values</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            {activeFilter === "fiscalYear" ? (
              <div className="space-y-1.5">
                <Label className="text-[11px] text-muted-foreground">
                  Fiscal Year
                </Label>
                <Select
                  value={fiscalYear || undefined}
                  onValueChange={setFiscalYear}
                >
                  <SelectTrigger className="h-8 w-full text-xs">
                    <SelectValue placeholder="Select fiscal year" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="2025-2026">2025-2026</SelectItem>
                    <SelectItem value="2024-2025">2024-2025</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            {activeFilter === "dateRange" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-[11px] text-muted-foreground">
                    From Date
                  </Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-full h-8 justify-between text-left font-normal text-xs px-2.5"
                      >
                        {formatFilterDate(fromDate) ?? "Start Date"}
                        <CalendarIcon className="size-3.5 text-muted-foreground/60" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <CalendarComponent
                        mode="single"
                        selected={fromDate}
                        onSelect={setFromDate}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[11px] text-muted-foreground">
                    To Date
                  </Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-full h-8 justify-between text-left font-normal text-xs px-2.5"
                      >
                        {formatFilterDate(toDate) ?? "End Date"}
                        <CalendarIcon className="size-3.5 text-muted-foreground/60" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <CalendarComponent
                        mode="single"
                        selected={toDate}
                        onSelect={setToDate}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            ) : null}

            {activeFilter === "financeBook" ? (
              <div className="space-y-1.5">
                <Label className="text-[11px] text-muted-foreground">
                  Finance Book
                </Label>
                <Input
                  value={financeBook}
                  onChange={(event) => setFinanceBook(event.target.value)}
                  placeholder="Finance Book"
                  className="h-8 text-xs"
                />
              </div>
            ) : null}

            {activeFilter === "currency" ? (
              <div className="space-y-1.5">
                <Label className="text-[11px] text-muted-foreground">
                  Currency
                </Label>
                <Select
                  value={currency || undefined}
                  onValueChange={setCurrency}
                >
                  <SelectTrigger className="h-8 w-full text-xs">
                    <SelectValue placeholder="Select currency" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="inr">INR (₹)</SelectItem>
                    <SelectItem value="try">TRY (₺)</SelectItem>
                    <SelectItem value="usd">USD ($)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : null}
          </div>

          <DialogFooter className="flex-row items-center justify-between gap-2 border-t px-4 py-3 sm:justify-between">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-xs"
              onClick={() => {
                if (activeFilter) clearFilter(activeFilter)
              }}
            >
              Clear
            </Button>
            <Button
              type="button"
              size="sm"
              className="text-xs"
              onClick={() => setActiveFilter(null)}
            >
              Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
