import * as React from "react"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb"
import { AIChatAssistant } from "@/components/layout/ai-chat-assistant"
import { WorkspaceAiDock } from "@/components/layout/workspace-ai-dock"
import { WorkspacePageHeader } from "@/components/layout/workspace-page-header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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

import {
  ChevronRight,
  ChevronDown,
  RefreshCw,
  MoreHorizontal,
  Calendar as CalendarIcon,
  ChevronsUpDown,
} from "lucide-react"

// Types for Tree Items
interface FinancialAccount {
  id: string
  name: string
  openingDr: string
  openingCr: string
  debit: string
  credit: string
  closingDr: string
  closingCr: string
  children?: FinancialAccount[]
}

const initialAccountData: FinancialAccount[] = [
  {
    id: "1",
    name: "Application of Funds (Assets)",
    openingDr: "₹ 0.00",
    openingCr: "₹ 0.00",
    debit: "₹ 1,20,00,000.0",
    credit: "₹ 0.00",
    closingDr: "₹ 1,20,00,000.0",
    closingCr: "₹ 0.00",
    children: [
      {
        id: "1-1",
        name: "Current Assets",
        openingDr: "₹ 0.00",
        openingCr: "₹ 0.00",
        debit: "₹ 1,20,00,000.0",
        credit: "₹ 0.00",
        closingDr: "₹ 1,20,00,000.0",
        closingCr: "₹ 0.00",
        children: [
          {
            id: "1-1-1",
            name: "Stock Assets",
            openingDr: "₹ 0.00",
            openingCr: "₹ 0.00",
            debit: "₹ 1,20,00,000.0",
            credit: "₹ 0.00",
            closingDr: "₹ 1,20,00,000.0",
            closingCr: "₹ 0.00",
            children: [
              {
                id: "1-1-1-1",
                name: "Stock In Hand",
                openingDr: "₹ 0.00",
                openingCr: "₹ 0.00",
                debit: "₹ 1,20,00,000.0",
                credit: "₹ 0.00",
                closingDr: "₹ 1,20,00,000.0",
                closingCr: "₹ 0.00",
              },
            ],
          },
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
        openingDr: "₹ 0.00",
        openingCr: "₹ 0.00",
        debit: "₹ 25,00,000.00",
        credit: "₹ 0.00",
        closingDr: "₹ 25,00,000.00",
        closingCr: "₹ 0.00",
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
                credit: "₹ 2,45,40,000.0",
                closingDr: "₹ 0.00",
                closingCr: "₹ 2,45,40,000.0",
              },
            ],
          },
          {
            id: "2-2-2",
            name: "Duties and Taxes",
            openingDr: "₹ 0.00",
            openingCr: "₹ 0.00",
            debit: "₹ 5,40,000.00",
            credit: "₹ 0.00",
            closingDr: "₹ 5,40,000.00",
            closingCr: "₹ 0.00",
            children: [
              {
                id: "2-2-2-1",
                name: "ST 6%",
                openingDr: "₹ 0.00",
                openingCr: "₹ 0.00",
                debit: "₹ 5,40,000.00",
                credit: "₹ 0.00",
                closingDr: "₹ 5,40,000.00",
                closingCr: "₹ 0.00",
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "3",
    name: "Expenses",
    openingDr: "₹ 0.00",
    openingCr: "₹ 0.00",
    debit: "₹ 95,00,000.00",
    credit: "₹ 0.00",
    closingDr: "₹ 95,00,000.00",
    closingCr: "₹ 0.00",
    children: [
      {
        id: "3-1",
        name: "Indirect Expenses",
        openingDr: "₹ 0.00",
        openingCr: "₹ 0.00",
        debit: "₹ 95,00,000.00",
        credit: "₹ 0.00",
        closingDr: "₹ 95,00,000.00",
        closingCr: "₹ 0.00",
      },
    ],
  },
]

export default function AccountingPage() {
  const [fromDate, setFromDate] = React.useState<Date | undefined>(new Date(2025, 3, 1))
  const [toDate, setToDate] = React.useState<Date | undefined>(new Date(2026, 2, 31))

  // Expanded nodes state
  const [expandedNodes, setExpandedNodes] = React.useState<Record<string, boolean>>({
    "1": true,
    "1-1": true,
    "1-1-1": true,
    "2": true,
    "2-2": true,
    "2-2-1": true,
    "2-2-2": true,
    "3": true,
    "3-1": true,
  })

  // Checkbox states matching screenshot
  const [withPeriodClosing, setWithPeriodClosing] = React.useState(true)
  const [periodClosingCurrent, setPeriodClosingCurrent] = React.useState(true)
  const [showZeroValues, setShowZeroValues] = React.useState(false)
  const [showUnclosedPnl, setShowUnclosedPnl] = React.useState(false)
  const [includeDefaultFb, setIncludeDefaultFb] = React.useState(true)
  const [showGroupAccounts, setShowGroupAccounts] = React.useState(true)

  const toggleNode = (id: string) => {
    setExpandedNodes((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  const collapseAll = () => {
    setExpandedNodes({})
  }

  const expandAll = () => {
    setExpandedNodes({
      "1": true,
      "1-1": true,
      "1-1-1": true,
      "1-1-1-1": true,
      "2": true,
      "2-1": true,
      "2-2": true,
      "2-2-1": true,
      "2-2-1-1": true,
      "2-2-2": true,
      "2-2-2-1": true,
      "3": true,
      "3-1": true,
    })
  }

  // Recursive Table Row Render Component
  const renderRows = (accounts: FinancialAccount[], depth = 0): React.ReactNode => {
    return accounts.map((acc) => {
      const hasChildren = acc.children && acc.children.length > 0
      const isExpanded = !!expandedNodes[acc.id]

      return (
        <React.Fragment key={acc.id}>
          <TableRow className="hover:bg-muted/30 text-xs transition-colors">
            <TableCell className="py-2 font-medium">
              <div className="flex items-center gap-1.5" style={{ paddingLeft: `${depth * 16}px` }}>
                {hasChildren ? (
                  <button
                    onClick={() => toggleNode(acc.id)}
                    className="size-4 inline-flex items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <ChevronDown
                      className={`size-3.5 transition-transform duration-150 ${
                        isExpanded ? "" : "-rotate-90"
                      }`}
                    />
                  </button>
                ) : (
                  <span className="size-4 inline-block" />
                )}
                <span className={hasChildren ? "font-semibold text-foreground" : "text-muted-foreground"}>
                  {acc.name}
                </span>
              </div>
            </TableCell>
            <TableCell className="py-2 text-right text-muted-foreground">{acc.openingDr}</TableCell>
            <TableCell className="py-2 text-right text-muted-foreground">{acc.openingCr}</TableCell>
            <TableCell className="py-2 text-right font-medium text-foreground">{acc.debit}</TableCell>
            <TableCell className="py-2 text-right text-muted-foreground">{acc.credit}</TableCell>
            <TableCell className="py-2 text-right font-medium text-foreground">{acc.closingDr}</TableCell>
            <TableCell className="py-2 text-right text-muted-foreground">{acc.closingCr}</TableCell>
          </TableRow>

          {hasChildren && isExpanded && renderRows(acc.children!, depth + 1)}
        </React.Fragment>
      )
    })
  }

  return (
    <>
      <WorkspacePageHeader
        searchPlaceholder="Search Financial Reports..."
        actions={
          <>
            <Select defaultValue="actions">
              <SelectTrigger className="h-7 text-xs font-normal gap-1 px-2.5">
                <span>Actions</span>
              </SelectTrigger>
              <SelectContent align="end">
                <SelectItem value="actions" className="hidden">Actions</SelectItem>
                <SelectItem value="export">Export to Excel</SelectItem>
                <SelectItem value="pdf">Print PDF</SelectItem>
                <SelectItem value="email">Email Report</SelectItem>
              </SelectContent>
            </Select>

            <Button variant="outline" size="icon" className="size-7">
              <RefreshCw className="size-3.5" />
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" className="size-7">
                  <MoreHorizontal className="size-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem>User Permissions</DropdownMenuItem>
                <DropdownMenuItem>Add to Desktop</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <AIChatAssistant variant="toolbar" />
          </>
        }
      >
        <Breadcrumb>
          <BreadcrumbList className="text-xs">
            <BreadcrumbItem>
              <BreadcrumbPage className="font-semibold text-foreground">
                Accounting
              </BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </WorkspacePageHeader>

        <WorkspaceAiDock>
        {/* Top Controls & Filter Panel */}
        <div className="p-4 space-y-4 border-b bg-muted/10">
          {/* Row 1: Filter Selectors */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="space-y-1">
              <Select defaultValue="5-values">
                <SelectTrigger className="h-8 w-full text-xs bg-muted/30 border-muted-foreground/20">
                  <SelectValue placeholder="Values" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="5-values">5 values selected</SelectItem>
                  <SelectItem value="all">All Values</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Select defaultValue="2025-2026">
                <SelectTrigger className="h-8 w-full text-xs font-medium bg-muted/30 border-muted-foreground/20">
                  <SelectValue placeholder="Fiscal Year" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="2025-2026">2025-2026</SelectItem>
                  <SelectItem value="2024-2025">2024-2025</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* From Date */}
            <div className="space-y-1">
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full h-8 justify-between text-left font-normal text-xs bg-muted/30 border-muted-foreground/20 px-2.5"
                  >
                    {fromDate ? (
                      fromDate.toLocaleDateString("en-GB").replace(/\//g, "-")
                    ) : (
                      <span>Start Date</span>
                    )}
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

            {/* To Date */}
            <div className="space-y-1">
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full h-8 justify-between text-left font-normal text-xs bg-muted/30 border-muted-foreground/20 px-2.5"
                  >
                    {toDate ? (
                      toDate.toLocaleDateString("en-GB").replace(/\//g, "-")
                    ) : (
                      <span>End Date</span>
                    )}
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

            <div className="space-y-1">
              <Input
                placeholder="Finance Book"
                className="h-8 text-xs bg-muted/20 border-muted-foreground/20 placeholder:text-muted-foreground/50"
              />
            </div>

            <div className="space-y-1">
              <Select defaultValue="currency">
                <SelectTrigger className="h-8 w-full text-xs bg-muted/30 border-muted-foreground/20 text-muted-foreground">
                  <SelectValue placeholder="Currency" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="currency">Currency</SelectItem>
                  <SelectItem value="try">TRY (₺)</SelectItem>
                  <SelectItem value="inr">INR (₹)</SelectItem>
                  <SelectItem value="usd">USD ($)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Row 2: Checkboxes Grid matching ERPNext layout */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 text-xs pt-1">
            <div className="flex items-center gap-2">
              <Checkbox
                id="withPeriodClosing"
                checked={withPeriodClosing}
                onCheckedChange={(checked) => setWithPeriodClosing(!!checked)}
              />
              <Label htmlFor="withPeriodClosing" className="text-xs font-normal text-foreground leading-snug cursor-pointer">
                With Period Closing Entry For Opening Balances
              </Label>
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="periodClosingCurrent"
                checked={periodClosingCurrent}
                onCheckedChange={(checked) => setPeriodClosingCurrent(!!checked)}
              />
              <Label htmlFor="periodClosingCurrent" className="text-xs font-normal text-foreground leading-snug cursor-pointer">
                Period Closing Entry For Current Period
              </Label>
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="showZeroValues"
                checked={showZeroValues}
                onCheckedChange={(checked) => setShowZeroValues(!!checked)}
              />
              <Label htmlFor="showZeroValues" className="text-xs font-normal text-muted-foreground leading-snug cursor-pointer">
                Show zero values
              </Label>
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="showUnclosedPnl"
                checked={showUnclosedPnl}
                onCheckedChange={(checked) => setShowUnclosedPnl(!!checked)}
              />
              <Label htmlFor="showUnclosedPnl" className="text-xs font-normal text-muted-foreground leading-snug cursor-pointer">
                Show unclosed fiscal year&apos;s P&L balances
              </Label>
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="includeDefaultFb"
                checked={includeDefaultFb}
                onCheckedChange={(checked) => setIncludeDefaultFb(!!checked)}
              />
              <Label htmlFor="includeDefaultFb" className="text-xs font-normal text-foreground leading-snug cursor-pointer">
                Include Default FB Entries
              </Label>
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="showGroupAccounts"
                checked={showGroupAccounts}
                onCheckedChange={(checked) => setShowGroupAccounts(!!checked)}
              />
              <Label htmlFor="showGroupAccounts" className="text-xs font-normal text-foreground leading-snug cursor-pointer">
                Show Group Accounts
              </Label>
            </div>
          </div>
        </div>

        {/* Scrollable Report Content Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="rounded-md border bg-card overflow-hidden">
            <Table>
              <TableHeader className="bg-muted/40 text-xs">
                {/* Header Title Row */}
                <TableRow className="border-b hover:bg-transparent">
                  <TableHead className="font-semibold text-foreground py-2.5">Account</TableHead>
                  <TableHead className="font-semibold text-foreground text-right py-2.5">Opening (Dr)</TableHead>
                  <TableHead className="font-semibold text-foreground text-right py-2.5">Opening (Cr)</TableHead>
                  <TableHead className="font-semibold text-foreground text-right py-2.5">Debit</TableHead>
                  <TableHead className="font-semibold text-foreground text-right py-2.5">Credit</TableHead>
                  <TableHead className="font-semibold text-foreground text-right py-2.5">Closing (Dr)</TableHead>
                  <TableHead className="font-semibold text-foreground text-right py-2.5">Closing (Cr)</TableHead>
                </TableRow>

                {/* Column Search Filter Inputs Row */}
                <TableRow className="border-b bg-muted/10 hover:bg-transparent">
                  <TableHead className="p-1.5">
                    <Input className="h-7 text-xs bg-muted/20 border-muted-foreground/20" />
                  </TableHead>
                  <TableHead className="p-1.5">
                    <Input className="h-7 text-xs bg-muted/20 border-muted-foreground/20 text-right" />
                  </TableHead>
                  <TableHead className="p-1.5">
                    <Input className="h-7 text-xs bg-muted/20 border-muted-foreground/20 text-right" />
                  </TableHead>
                  <TableHead className="p-1.5">
                    <Input className="h-7 text-xs bg-muted/20 border-muted-foreground/20 text-right" />
                  </TableHead>
                  <TableHead className="p-1.5">
                    <Input className="h-7 text-xs bg-muted/20 border-muted-foreground/20 text-right" />
                  </TableHead>
                  <TableHead className="p-1.5">
                    <Input className="h-7 text-xs bg-muted/20 border-muted-foreground/20 text-right" />
                  </TableHead>
                  <TableHead className="p-1.5">
                    <Input className="h-7 text-xs bg-muted/20 border-muted-foreground/20 text-right" />
                  </TableHead>
                </TableRow>
              </TableHeader>

              <TableBody className="divide-y">
                {renderRows(initialAccountData)}
              </TableBody>
            </Table>
          </div>

          {/* Bottom Controls Bar */}
          <div className="flex items-center gap-2 pt-2 text-xs">
            <div className="flex items-center gap-1.5">
              <Input defaultValue="2" className="h-7 w-10 text-center text-xs bg-muted/20 border-muted-foreground/20 px-1" />
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
          </div>
        </div>
        </WorkspaceAiDock>
    </>
  )
}
