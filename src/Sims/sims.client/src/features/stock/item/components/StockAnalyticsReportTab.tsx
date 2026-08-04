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
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Calendar as CalendarComponent } from "@/components/ui/calendar"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import { cn } from "@/utils/cn"
import {
  Calendar as CalendarIcon,
  ChevronDown,
  ChevronRight,
  Filter,
  Play,
} from "lucide-react"

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

export function StockAnalyticsReportTab() {
  const [expandedNodes, setExpandedNodes] =
    React.useState<Record<string, boolean>>(initialExpanded)
  const [filtersOpen, setFiltersOpen] = React.useState(true)
  const [fromDate, setFromDate] = React.useState<Date | undefined>(
    new Date(2025, 3, 1)
  )
  const [toDate, setToDate] = React.useState<Date | undefined>(
    new Date(2026, 2, 31)
  )
  const [showZeroValues, setShowZeroValues] = React.useState(false)
  const [showGroupAccounts, setShowGroupAccounts] = React.useState(true)
  const [running, setRunning] = React.useState(false)

  const toggleNode = (id: string) => {
    setExpandedNodes((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  const collapseAll = () => setExpandedNodes({})

  const expandAll = () => {
    setExpandedNodes(
      Object.fromEntries(allNodeIds.map((id) => [id, true])) as Record<
        string,
        boolean
      >
    )
  }

  const runReport = () => {
    setRunning(true)
    window.setTimeout(() => setRunning(false), 600)
  }

  const renderRows = (rows: ReportRow[], depth = 0): React.ReactNode =>
    rows.map((row) => {
      const hasChildren = !!row.children?.length
      const isExpanded = !!expandedNodes[row.id]

      return (
        <React.Fragment key={row.id}>
          <tr className="border-b hover:bg-muted/30 text-xs">
            <td className="py-2 px-2 font-medium whitespace-nowrap">
              <div
                className="flex items-center gap-1.5"
                style={{ paddingLeft: `${depth * 16}px` }}
              >
                {hasChildren ? (
                  <button
                    type="button"
                    onClick={() => toggleNode(row.id)}
                    className="size-4 inline-flex items-center justify-center rounded hover:bg-muted text-muted-foreground"
                  >
                    <ChevronDown
                      className={cn(
                        "size-3.5 transition-transform",
                        !isExpanded && "-rotate-90"
                      )}
                    />
                  </button>
                ) : (
                  <span className="size-4 inline-block" />
                )}
                <span
                  className={
                    hasChildren
                      ? "font-semibold text-foreground"
                      : "text-muted-foreground"
                  }
                >
                  {row.name}
                </span>
              </div>
            </td>
            <td className="py-2 px-2 text-right text-muted-foreground whitespace-nowrap">
              {row.openingDr}
            </td>
            <td className="py-2 px-2 text-right text-muted-foreground whitespace-nowrap">
              {row.openingCr}
            </td>
            <td className="py-2 px-2 text-right font-medium whitespace-nowrap">
              {row.debit}
            </td>
            <td className="py-2 px-2 text-right text-muted-foreground whitespace-nowrap">
              {row.credit}
            </td>
            <td className="py-2 px-2 text-right font-medium whitespace-nowrap">
              {row.closingDr}
            </td>
            <td className="py-2 px-2 text-right text-muted-foreground whitespace-nowrap">
              {row.closingCr}
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
      <ResizablePanel defaultSize={filtersOpen ? "72" : "100"} minSize="45">
        <div className="flex h-full min-h-0 flex-col overflow-hidden p-4 gap-3">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border bg-card">
            <div className="shrink-0 border-b bg-muted/40">
              <table className="w-full table-fixed caption-bottom border-separate border-spacing-0 text-xs">
                <colgroup>
                  <col className="w-[28%]" />
                  <col />
                  <col />
                  <col />
                  <col />
                  <col />
                  <col />
                </colgroup>
                <thead>
                  <tr>
                    <th className="h-10 px-2 text-left font-semibold text-foreground">
                      Account
                    </th>
                    <th className="h-10 px-2 text-right font-semibold text-foreground">
                      Opening (Dr)
                    </th>
                    <th className="h-10 px-2 text-right font-semibold text-foreground">
                      Opening (Cr)
                    </th>
                    <th className="h-10 px-2 text-right font-semibold text-foreground">
                      Debit
                    </th>
                    <th className="h-10 px-2 text-right font-semibold text-foreground">
                      Credit
                    </th>
                    <th className="h-10 px-2 text-right font-semibold text-foreground">
                      Closing (Dr)
                    </th>
                    <th className="h-10 px-2 text-right font-semibold text-foreground">
                      Closing (Cr)
                    </th>
                  </tr>
                  <tr className="border-t bg-muted/10">
                    {Array.from({ length: 7 }).map((_, index) => (
                      <th key={index} className="p-1.5">
                        <Input
                          className={cn(
                            "h-7 text-xs bg-muted/20 border-muted-foreground/20",
                            index > 0 && "text-right"
                          )}
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
                  <col className="w-[28%]" />
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

          <div className="flex shrink-0 items-center gap-2 text-xs">
            <div className="flex items-center gap-1.5">
              <Input
                defaultValue="2"
                className="h-7 w-10 text-center text-xs bg-muted/20 border-muted-foreground/20 px-1"
              />
              <Button variant="outline" size="sm" className="h-7 text-xs px-2.5">
                Set Level
              </Button>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs px-2.5"
              onClick={collapseAll}
            >
              Collapse All
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs px-2.5"
              onClick={expandAll}
            >
              Expand All
            </Button>
            {!filtersOpen ? (
              <Button
                variant="outline"
                size="sm"
                className="ml-auto h-7 text-xs gap-1.5 px-2.5"
                onClick={() => setFiltersOpen(true)}
              >
                <Filter className="size-3.5" />
                Filters
              </Button>
            ) : null}
          </div>
        </div>
      </ResizablePanel>

      {filtersOpen ? (
        <>
          <ResizableHandle withHandle />
          <ResizablePanel
            defaultSize="28"
            minSize="18"
            maxSize="40"
            collapsible
            collapsedSize={0}
          >
            <aside className="flex h-full min-h-0 flex-col overflow-hidden bg-muted/10">
              <div className="flex shrink-0 items-center justify-between gap-2 border-b px-4 py-3">
                <h3 className="text-sm font-semibold">Filters</h3>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  onClick={() => setFiltersOpen(false)}
                  aria-label="Collapse filters"
                >
                  <ChevronRight className="size-4" />
                </Button>
              </div>

              <ScrollArea className="h-0 min-h-0 flex-1">
                <div className="space-y-4 p-4 text-xs">
                  <div className="space-y-1.5">
                    <Label className="text-[11px] text-muted-foreground">
                      Values
                    </Label>
                    <Select defaultValue="5-values">
                      <SelectTrigger className="h-8 w-full text-xs bg-muted/30 border-muted-foreground/20">
                        <SelectValue placeholder="Values" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="5-values">
                          5 values selected
                        </SelectItem>
                        <SelectItem value="all">All Values</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-[11px] text-muted-foreground">
                      Fiscal Year
                    </Label>
                    <Select defaultValue="2025-2026">
                      <SelectTrigger className="h-8 w-full text-xs bg-muted/30 border-muted-foreground/20">
                        <SelectValue placeholder="Fiscal Year" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="2025-2026">2025-2026</SelectItem>
                        <SelectItem value="2024-2025">2024-2025</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-[11px] text-muted-foreground">
                      From Date
                    </Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className="w-full h-8 justify-between text-left font-normal text-xs bg-muted/30 border-muted-foreground/20 px-2.5"
                        >
                          {fromDate
                            ? fromDate
                                .toLocaleDateString("en-GB")
                                .replace(/\//g, "-")
                            : "Start Date"}
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
                          className="w-full h-8 justify-between text-left font-normal text-xs bg-muted/30 border-muted-foreground/20 px-2.5"
                        >
                          {toDate
                            ? toDate
                                .toLocaleDateString("en-GB")
                                .replace(/\//g, "-")
                            : "End Date"}
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

                  <div className="space-y-1.5">
                    <Label className="text-[11px] text-muted-foreground">
                      Finance Book
                    </Label>
                    <Input
                      placeholder="Finance Book"
                      className="h-8 text-xs bg-muted/20 border-muted-foreground/20"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-[11px] text-muted-foreground">
                      Currency
                    </Label>
                    <Select defaultValue="inr">
                      <SelectTrigger className="h-8 w-full text-xs bg-muted/30 border-muted-foreground/20">
                        <SelectValue placeholder="Currency" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="inr">INR (₹)</SelectItem>
                        <SelectItem value="try">TRY (₺)</SelectItem>
                        <SelectItem value="usd">USD ($)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <Separator />

                  <div className="space-y-3">
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

              <div className="shrink-0 border-t p-4">
                <Button
                  type="button"
                  className="w-full h-8 text-xs gap-1.5"
                  onClick={runReport}
                  disabled={running}
                >
                  <Play className="size-3.5" />
                  {running ? "Running…" : "Run Report"}
                </Button>
              </div>
            </aside>
          </ResizablePanel>
        </>
      ) : null}
    </ResizablePanelGroup>
  )
}
