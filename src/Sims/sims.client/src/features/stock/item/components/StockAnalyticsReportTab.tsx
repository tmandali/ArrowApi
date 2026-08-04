import * as React from "react"
import { useSearchParams } from "react-router-dom"
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
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
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
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import { cn } from "@/utils/cn"
import { useWorkspaceNotifications } from "@/context/workspace-notifications"
import {
  BookOpen,
  Calendar as CalendarIcon,
  CalendarRange,
  ChevronDown,
  ChevronRight,
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
  "h-7 px-2 border-r border-b border-border/60 last:border-r-0 text-[11px] font-medium text-muted-foreground bg-muted/30"

type ReportRow = {
  id: string
  name: string
  openingDr: string
  openingCr: string
  debit: string
  credit: string
  closingDr: string
  closingCr: string
  children?: ReportRow[]
}

const money = (value: string): Pick<
  ReportRow,
  "openingDr" | "openingCr" | "debit" | "credit" | "closingDr" | "closingCr"
> => ({
  openingDr: "₹ 0.00",
  openingCr: "₹ 0.00",
  debit: value,
  credit: "₹ 0.00",
  closingDr: value,
  closingCr: "₹ 0.00",
})

const reportData: ReportRow[] = [
  {
    id: "1",
    name: "Application of Funds (Assets)",
    ...money("₹ 1,20,00,000.0"),
    children: [
      {
        id: "1-1",
        name: "Current Assets",
        ...money("₹ 1,20,00,000.0"),
        children: [
          {
            id: "1-1-1",
            name: "Stock Assets",
            ...money("₹ 1,20,00,000.0"),
            children: [
              { id: "1-1-1-1", name: "Stock In Hand", ...money("₹ 85,00,000.00") },
              { id: "1-1-1-2", name: "Work In Progress", ...money("₹ 20,00,000.00") },
              { id: "1-1-1-3", name: "Finished Goods", ...money("₹ 15,00,000.00") },
            ],
          },
          {
            id: "1-1-2",
            name: "Accounts Receivable",
            ...money("₹ 45,00,000.00"),
            children: [
              { id: "1-1-2-1", name: "Debtors", ...money("₹ 40,00,000.00") },
              { id: "1-1-2-2", name: "Debtors USD", ...money("₹ 5,00,000.00") },
            ],
          },
          {
            id: "1-1-3",
            name: "Bank Accounts",
            ...money("₹ 32,50,000.00"),
            children: [
              { id: "1-1-3-1", name: "HDFC - Current", ...money("₹ 18,00,000.00") },
              { id: "1-1-3-2", name: "SBI - Current", ...money("₹ 10,50,000.00") },
              { id: "1-1-3-3", name: "Petty Cash", ...money("₹ 4,00,000.00") },
            ],
          },
          {
            id: "1-1-4",
            name: "Cash In Hand",
            ...money("₹ 2,25,000.00"),
          },
        ],
      },
      {
        id: "1-2",
        name: "Fixed Assets",
        ...money("₹ 75,00,000.00"),
        children: [
          { id: "1-2-1", name: "Buildings", ...money("₹ 40,00,000.00") },
          { id: "1-2-2", name: "Plant and Machinery", ...money("₹ 25,00,000.00") },
          { id: "1-2-3", name: "Furniture and Fixtures", ...money("₹ 6,00,000.00") },
          { id: "1-2-4", name: "Vehicles", ...money("₹ 4,00,000.00") },
        ],
      },
    ],
  },
  {
    id: "2",
    name: "Source of Funds (Liabilities)",
    openingDr: "₹ 0.00",
    openingCr: "₹ 0.00",
    debit: "₹ 5,40,000.00",
    credit: "₹ 2,45,40,000.0",
    closingDr: "₹ 0.00",
    closingCr: "₹ 2,40,00,000.0",
    children: [
      {
        id: "2-1",
        name: "Foreign Currency Translation Reserve",
        ...money("₹ 25,00,000.00"),
      },
      {
        id: "2-2",
        name: "Current Liabilities",
        openingDr: "₹ 0.00",
        openingCr: "₹ 0.00",
        debit: "₹ 5,40,000.00",
        credit: "₹ 2,45,40,000.0",
        closingDr: "₹ 0.00",
        closingCr: "₹ 2,40,00,000.0",
        children: [
          {
            id: "2-2-1",
            name: "Accounts Payable",
            openingDr: "₹ 0.00",
            openingCr: "₹ 0.00",
            debit: "₹ 0.00",
            credit: "₹ 2,45,40,000.0",
            closingDr: "₹ 0.00",
            closingCr: "₹ 2,45,40,000.0",
            children: [
              {
                id: "2-2-1-1",
                name: "Creditors",
                openingDr: "₹ 0.00",
                openingCr: "₹ 0.00",
                debit: "₹ 0.00",
                credit: "₹ 2,20,00,000.0",
                closingDr: "₹ 0.00",
                closingCr: "₹ 2,20,00,000.0",
              },
              {
                id: "2-2-1-2",
                name: "Creditors EUR",
                openingDr: "₹ 0.00",
                openingCr: "₹ 0.00",
                debit: "₹ 0.00",
                credit: "₹ 25,40,000.00",
                closingDr: "₹ 0.00",
                closingCr: "₹ 25,40,000.00",
              },
            ],
          },
          {
            id: "2-2-2",
            name: "Duties and Taxes",
            ...money("₹ 5,40,000.00"),
            children: [
              { id: "2-2-2-1", name: "ST 6%", ...money("₹ 2,10,000.00") },
              { id: "2-2-2-2", name: "GST Payable", ...money("₹ 2,80,000.00") },
              { id: "2-2-2-3", name: "TDS Payable", ...money("₹ 50,000.00") },
            ],
          },
          {
            id: "2-2-3",
            name: "Provisions",
            ...money("₹ 8,75,000.00"),
            children: [
              { id: "2-2-3-1", name: "Provision for Expenses", ...money("₹ 5,00,000.00") },
              { id: "2-2-3-2", name: "Provision for Tax", ...money("₹ 3,75,000.00") },
            ],
          },
        ],
      },
      {
        id: "2-3",
        name: "Loans (Liability)",
        ...money("₹ 50,00,000.00"),
        children: [
          { id: "2-3-1", name: "Bank Overdraft", ...money("₹ 15,00,000.00") },
          { id: "2-3-2", name: "Secured Loans", ...money("₹ 35,00,000.00") },
        ],
      },
    ],
  },
  {
    id: "3",
    name: "Expenses",
    ...money("₹ 95,00,000.00"),
    children: [
      {
        id: "3-1",
        name: "Indirect Expenses",
        ...money("₹ 55,00,000.00"),
        children: [
          { id: "3-1-1", name: "Salary and Wages", ...money("₹ 28,00,000.00") },
          { id: "3-1-2", name: "Rent", ...money("₹ 12,00,000.00") },
          { id: "3-1-3", name: "Utilities", ...money("₹ 6,50,000.00") },
          { id: "3-1-4", name: "Office Supplies", ...money("₹ 3,25,000.00") },
          { id: "3-1-5", name: "Travel and Conveyance", ...money("₹ 5,25,000.00") },
        ],
      },
      {
        id: "3-2",
        name: "Direct Expenses",
        ...money("₹ 40,00,000.00"),
        children: [
          { id: "3-2-1", name: "Freight Inward", ...money("₹ 8,00,000.00") },
          { id: "3-2-2", name: "Manufacturing Expenses", ...money("₹ 22,00,000.00") },
          { id: "3-2-3", name: "Packing Expenses", ...money("₹ 10,00,000.00") },
        ],
      },
    ],
  },
  {
    id: "4",
    name: "Income",
    openingDr: "₹ 0.00",
    openingCr: "₹ 0.00",
    debit: "₹ 0.00",
    credit: "₹ 3,10,00,000.0",
    closingDr: "₹ 0.00",
    closingCr: "₹ 3,10,00,000.0",
    children: [
      {
        id: "4-1",
        name: "Direct Income",
        openingDr: "₹ 0.00",
        openingCr: "₹ 0.00",
        debit: "₹ 0.00",
        credit: "₹ 2,80,00,000.0",
        closingDr: "₹ 0.00",
        closingCr: "₹ 2,80,00,000.0",
        children: [
          {
            id: "4-1-1",
            name: "Sales",
            openingDr: "₹ 0.00",
            openingCr: "₹ 0.00",
            debit: "₹ 0.00",
            credit: "₹ 2,50,00,000.0",
            closingDr: "₹ 0.00",
            closingCr: "₹ 2,50,00,000.0",
          },
          {
            id: "4-1-2",
            name: "Service Income",
            openingDr: "₹ 0.00",
            openingCr: "₹ 0.00",
            debit: "₹ 0.00",
            credit: "₹ 30,00,000.00",
            closingDr: "₹ 0.00",
            closingCr: "₹ 30,00,000.00",
          },
        ],
      },
      {
        id: "4-2",
        name: "Indirect Income",
        openingDr: "₹ 0.00",
        openingCr: "₹ 0.00",
        debit: "₹ 0.00",
        credit: "₹ 30,00,000.00",
        closingDr: "₹ 0.00",
        closingCr: "₹ 30,00,000.00",
        children: [
          {
            id: "4-2-1",
            name: "Interest Income",
            openingDr: "₹ 0.00",
            openingCr: "₹ 0.00",
            debit: "₹ 0.00",
            credit: "₹ 12,00,000.00",
            closingDr: "₹ 0.00",
            closingCr: "₹ 12,00,000.00",
          },
          {
            id: "4-2-2",
            name: "Other Income",
            openingDr: "₹ 0.00",
            openingCr: "₹ 0.00",
            debit: "₹ 0.00",
            credit: "₹ 18,00,000.00",
            closingDr: "₹ 0.00",
            closingCr: "₹ 18,00,000.00",
          },
        ],
      },
    ],
  },
]

function collectIds(rows: ReportRow[]): string[] {
  return rows.flatMap((row) => [
    row.id,
    ...(row.children ? collectIds(row.children) : []),
  ])
}

const allNodeIds = collectIds(reportData)

const initialExpanded = Object.fromEntries(
  allNodeIds.map((id) => [id, true])
) as Record<string, boolean>

/** Shared layout % — Filters panel and Account column stay aligned. */
const FILTERS_WIDTH_PERCENT = 20
const REPORT_WIDTH_PERCENT = 100 - FILTERS_WIDTH_PERCENT
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

const reportRunSteps = [
  {
    key: "preparing",
    title: "Preparing",
    detail: "validating filters",
    tone: "muted",
  },
  {
    key: "fetching",
    title: "Running",
    detail: "fetching ledger balances",
    tone: "success",
  },
  {
    key: "building",
    title: "Building",
    detail: "assembling account tree",
    tone: "success",
  },
] as const

type ReportRunStepKey = (typeof reportRunSteps)[number]["key"]
type ReportRunStatus = "idle" | "running" | "done" | "cancelled"

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
}: {
  filtersOpen?: boolean
  onFiltersOpenChange?: (open: boolean) => void
  runReportToken?: number
  treeAction?: StockAnalyticsTreeAction | null
  onReportReadyChange?: (ready: boolean) => void
} = {}) {
  const [expandedNodes, setExpandedNodes] =
    React.useState<Record<string, boolean>>(initialExpanded)
  const [internalFiltersOpen, setInternalFiltersOpen] = React.useState(true)
  const filtersOpen = filtersOpenProp ?? internalFiltersOpen
  const setFiltersOpen = onFiltersOpenChange ?? setInternalFiltersOpen
  const [fromDate, setFromDate] = React.useState<Date | undefined>(
    new Date(2025, 3, 1)
  )
  const [toDate, setToDate] = React.useState<Date | undefined>(
    new Date(2026, 2, 31)
  )
  const [valuesMode, setValuesMode] = React.useState("5-values")
  const [fiscalYear, setFiscalYear] = React.useState("2025-2026")
  const [financeBook, setFinanceBook] = React.useState("")
  const [currency, setCurrency] = React.useState("inr")
  const [activeFilter, setActiveFilter] = React.useState<FilterKey | null>(null)
  const [openPicker, setOpenPicker] = React.useState<FilterKey | null>(null)
  const [showZeroValues, setShowZeroValues] = React.useState(false)
  const [showGroupAccounts, setShowGroupAccounts] = React.useState(true)
  const [runStatus, setRunStatus] = React.useState<ReportRunStatus>("idle")
  const [runStepKey, setRunStepKey] =
    React.useState<ReportRunStepKey>("preparing")
  const [reportReady, setReportReady] = React.useState(false)
  const runIdRef = React.useRef(0)
  const isMountedRef = React.useRef(true)
  const running = runStatus === "running"
  const [searchParams, setSearchParams] = useSearchParams()
  const { pushNotification } = useWorkspaceNotifications()

  React.useEffect(() => {
    onReportReadyChange?.(reportReady)
  }, [reportReady, onReportReadyChange])

  React.useEffect(() => {
    return () => onReportReadyChange?.(false)
  }, [onReportReadyChange])

  React.useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  const openReportFromNotification = React.useCallback(() => {
    setReportReady(true)
    setRunStatus("idle")
  }, [])

  React.useEffect(() => {
    if (searchParams.get("openReport") !== "1") return
    openReportFromNotification()
    const next = new URLSearchParams(searchParams)
    next.delete("openReport")
    setSearchParams(next, { replace: true })
  }, [searchParams, setSearchParams, openReportFromNotification])

  const toggleNode = (id: string) => {
    setExpandedNodes((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  const collapseAll = React.useCallback(() => setExpandedNodes({}), [])

  const expandAll = React.useCallback(() => {
    setExpandedNodes(
      Object.fromEntries(allNodeIds.map((id) => [id, true])) as Record<
        string,
        boolean
      >
    )
  }, [])

  const setLevel = React.useCallback((level: number) => {
    const next: Record<string, boolean> = {}
    const walk = (rows: ReportRow[], depth: number) => {
      for (const row of rows) {
        if (!row.children?.length) continue
        next[row.id] = depth < level
        walk(row.children, depth + 1)
      }
    }
    walk(reportData, 1)
    setExpandedNodes(next)
  }, [])

  const cancelReport = React.useCallback(() => {
    runIdRef.current += 1
    setRunStatus("cancelled")
  }, [])

  const runReport = React.useCallback(async () => {
    const runId = ++runIdRef.current
    setReportReady(false)
    setRunStatus("running")
    setRunStepKey("preparing")

    const wait = (ms: number) =>
      new Promise<boolean>((resolve) => {
        window.setTimeout(() => resolve(runIdRef.current === runId), ms)
      })

    for (let index = 0; index < reportRunSteps.length; index += 1) {
      const step = reportRunSteps[index]
      setRunStepKey(step.key)
      const stillRunning = await wait(900)
      if (!stillRunning) return
    }

    if (runIdRef.current !== runId) return
    pushNotification({
      title: "Stock Analytics Ready",
      description:
        "Stock Analytics raporu tamamlandı. Açmak için bildirime tıklayın.",
      type: "report",
      href: "/stock/stock-analytics?openReport=1",
    })
    if (!isMountedRef.current) return
    setRunStatus("done")
    window.setTimeout(() => {
      if (runIdRef.current === runId && isMountedRef.current) {
        setReportReady(true)
        setRunStatus("idle")
      }
    }, 700)
  }, [pushNotification])

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

  const currentStepIndex = reportRunSteps.findIndex(
    (step) => step.key === runStepKey
  )
  const showGrid = reportReady && runStatus === "idle"
  const showRunSteps =
    runStatus === "running" ||
    runStatus === "cancelled" ||
    runStatus === "done"

  const renderRows = (rows: ReportRow[], depth = 0): React.ReactNode =>
    rows.map((row) => {
      const hasChildren = !!row.children?.length
      const isExpanded = !!expandedNodes[row.id]

      return (
        <React.Fragment key={row.id}>
          <tr className="hover:bg-muted/30 text-xs">
            <td className={cellClass}>
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
            <td className={cellClass}>
              <div className="flex h-7 items-center justify-end px-2 text-muted-foreground whitespace-nowrap">
                {row.openingDr}
              </div>
            </td>
            <td className={cellClass}>
              <div className="flex h-7 items-center justify-end px-2 text-muted-foreground whitespace-nowrap">
                {row.openingCr}
              </div>
            </td>
            <td className={cellClass}>
              <div className="flex h-7 items-center justify-end px-2 font-medium whitespace-nowrap">
                {row.debit}
              </div>
            </td>
            <td className={cellClass}>
              <div className="flex h-7 items-center justify-end px-2 text-muted-foreground whitespace-nowrap">
                {row.credit}
              </div>
            </td>
            <td className={cellClass}>
              <div className="flex h-7 items-center justify-end px-2 font-medium whitespace-nowrap">
                {row.closingDr}
              </div>
            </td>
            <td className={cellClass}>
              <div className="flex h-7 items-center justify-end px-2 text-muted-foreground whitespace-nowrap">
                {row.closingCr}
              </div>
            </td>
          </tr>
          {hasChildren && isExpanded
            ? renderRows(row.children!, depth + 1)
            : null}
        </React.Fragment>
      )
    })

  return (
    <ResizablePanelGroup
      key={filtersOpen ? "split" : "full"}
      orientation="horizontal"
      className="h-full min-h-0 w-full"
    >
      <ResizablePanel
        defaultSize={filtersOpen ? String(REPORT_WIDTH_PERCENT) : "100"}
        minSize="45"
      >
        <div className="flex h-full min-h-0 flex-col overflow-hidden p-4 gap-3">
          {showGrid ? (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border bg-card">
              <div className="shrink-0 border-b">
                <table className="w-full table-fixed caption-bottom border-separate border-spacing-0 text-xs">
                  <colgroup>
                    <col style={ACCOUNT_COL_STYLE} />
                    <col />
                    <col />
                    <col />
                    <col />
                    <col />
                    <col />
                  </colgroup>
                  <thead>
                    <tr>
                      <th className={cn(headClass, "text-left")}>Account</th>
                      <th className={cn(headClass, "text-right")}>
                        Opening (Dr)
                      </th>
                      <th className={cn(headClass, "text-right")}>
                        Opening (Cr)
                      </th>
                      <th className={cn(headClass, "text-right")}>Debit</th>
                      <th className={cn(headClass, "text-right")}>Credit</th>
                      <th className={cn(headClass, "text-right")}>
                        Closing (Dr)
                      </th>
                      <th className={cn(headClass, "text-right")}>
                        Closing (Cr)
                      </th>
                    </tr>
                    <tr className="bg-muted/10">
                      {Array.from({ length: 7 }).map((_, index) => (
                        <th key={index} className={cellClass}>
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
                  </thead>
                </table>
              </div>

              <ScrollArea className="h-0 min-h-0 w-full flex-1">
                <table className="w-full table-fixed caption-bottom border-separate border-spacing-0 text-xs">
                  <colgroup>
                    <col style={ACCOUNT_COL_STYLE} />
                    <col />
                    <col />
                    <col />
                    <col />
                    <col />
                    <col />
                  </colgroup>
                  <tbody>{renderRows(reportData)}</tbody>
                </table>
              </ScrollArea>
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 items-center justify-center rounded-md border border-dashed bg-card/40 p-6">
              <Empty className="max-w-xs border-0 p-0">
                {showRunSteps ? (
                  <EmptyHeader className="max-w-none items-stretch">
                    <EmptyContent className="items-stretch gap-3 text-left">
                      {reportRunSteps.map((step, index) => {
                        const isCurrent = index === currentStepIndex
                        const isComplete =
                          runStatus === "done" ||
                          ((runStatus === "running" ||
                            runStatus === "cancelled") &&
                            index < currentStepIndex)
                        const isCancelledHere =
                          runStatus === "cancelled" && isCurrent
                        const isPending =
                          (runStatus === "running" ||
                            runStatus === "cancelled") &&
                          index > currentStepIndex

                        const titleClass = isCancelledHere
                          ? "font-medium text-amber-500"
                          : isComplete || (isCurrent && step.tone === "success")
                            ? "font-medium text-emerald-600"
                            : isCurrent
                              ? "text-muted-foreground"
                              : "text-muted-foreground/70"

                        const iconClass = isCancelledHere
                          ? "text-amber-500"
                          : isComplete || (isCurrent && step.tone === "success")
                            ? "text-emerald-600"
                            : "text-muted-foreground"

                        return (
                          <div
                            key={step.key}
                            className={cn(
                              "flex items-center gap-2",
                              isPending && "opacity-50"
                            )}
                          >
                            {runStatus === "running" && isCurrent ? (
                              <Spinner
                                className={cn("size-3.5 shrink-0", iconClass)}
                              />
                            ) : isComplete ? (
                              <Check
                                className={cn("size-3.5 shrink-0", iconClass)}
                              />
                            ) : isCancelledHere ? (
                              <X
                                className={cn("size-3.5 shrink-0", iconClass)}
                              />
                            ) : (
                              <span className="size-3.5 shrink-0 rounded-full border border-muted-foreground/40" />
                            )}
                            <span className="text-sm">
                              <span className={titleClass}>
                                {isCancelledHere ? "Cancelled" : step.title}
                              </span>
                              <span className="text-muted-foreground">
                                {" "}
                                —{" "}
                                {isCancelledHere
                                  ? "report stopped"
                                  : step.detail}
                              </span>
                            </span>
                          </div>
                        )
                      })}

                      {running ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="mt-1 h-7 self-start text-xs"
                          onClick={cancelReport}
                        >
                          Cancel
                        </Button>
                      ) : runStatus === "cancelled" ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="mt-1 h-7 self-start text-xs"
                          onClick={() => setRunStatus("idle")}
                        >
                          Dismiss
                        </Button>
                      ) : null}
                    </EmptyContent>
                  </EmptyHeader>
                ) : (
                  <EmptyHeader>
                    <EmptyTitle>No report yet</EmptyTitle>
                    <EmptyDescription>
                      Query panelinden kriterleri seçip Execute ile grid’i üretin.
                    </EmptyDescription>
                  </EmptyHeader>
                )}
              </Empty>
            </div>
          )}
        </div>
      </ResizablePanel>

      {filtersOpen ? (
        <>
          <ResizableHandle withHandle />
          <ResizablePanel
            defaultSize={String(FILTERS_WIDTH_PERCENT)}
            minSize={String(FILTERS_WIDTH_PERCENT)}
            maxSize="40"
            collapsible
            collapsedSize={0}
            onResize={(size) => {
              if (size.asPercentage <= 0 || size.inPixels <= 0) {
                setFiltersOpen(false)
              }
            }}
          >
            <aside className="flex h-full min-h-0 flex-col overflow-hidden bg-muted/10">
              <button
                type="button"
                onClick={() => setFiltersOpen(false)}
                className="flex shrink-0 w-full items-center justify-between gap-2 border-b px-3 py-2.5 text-left transition-colors hover:bg-muted/40"
                aria-label="Collapse filters"
              >
                <span className="text-sm font-semibold">Query</span>
                <ChevronRight className="size-4 text-muted-foreground" />
              </button>

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
                        className="text-xs font-normal leading-snug cursor-pointer"
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
                        className="text-xs font-normal leading-snug cursor-pointer"
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
                  className="w-full h-8 text-xs gap-1.5"
                  onClick={() => void runReport()}
                  disabled={running}
                >
                  {running ? (
                    <Spinner className="size-3.5" />
                  ) : (
                    <Play className="size-3.5" />
                  )}
                  {running ? "Running…" : "Execute"}
                </Button>
              </div>
            </aside>
          </ResizablePanel>
        </>
      ) : null}

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
    </ResizablePanelGroup>
  )
}
