import * as React from "react"
import { Link } from "react-router-dom"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { AIChatAssistant } from "@/components/layout/ai-chat-assistant"
import { WorkspacePageShell } from "@/components/layout/workspace-page-shell"
import { panelCardClass, pageContentGutterClass, panelHeaderClass, panelHeaderIconClass, panelHeaderSubtitleClass, panelHeaderTitleClass } from "@/components/layout/panel-chrome"
import { cn } from "@/utils/cn"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

import {
  ChevronDown,
  RefreshCw,
  MoreHorizontal,
  FileText,
  ListFilter,
} from "lucide-react"

/** Match Stock Balance / Analytics criteria spreadsheet chrome. */
const cellInputClass =
  "h-7 w-full min-w-0 rounded-none border border-transparent bg-transparent px-2 py-0 text-xs shadow-none outline-none ring-0 transition-none focus-visible:border-border focus-visible:bg-background focus-visible:ring-0 placeholder:text-muted-foreground/70"

const cellClass =
  "overflow-hidden p-0 align-middle border-r border-b border-border/60 last:border-r-0"

const headClass =
  "h-7 overflow-hidden px-2 py-0 align-middle border-r border-b border-border/60 last:border-r-0 text-[11px] font-medium leading-none text-muted-foreground bg-muted/40"

const rowIndexClass =
  "bg-muted/40 text-[11px] tabular-nums text-muted-foreground"

// Types for Stock Tree Items
interface StockItem {
  id: string
  rowNo: number
  itemCode: string
  itemName: string
  serialNo?: string
  batchNo?: string
  batchExpiryDate?: string
  quantity: string
  voucherType: string
  sourceWarehouse?: string
  children?: StockItem[]
}

const initialStockData: StockItem[] = [
  {
    id: "39",
    rowNo: 39,
    itemCode: "M4 MacBook Air",
    itemName: "M4 MacBook ...",
    serialNo: "M4MCBA0004",
    quantity: "1.000",
    voucherType: "Stock Entry",
    children: [
      {
        id: "40",
        rowNo: 40,
        itemCode: "M4 Circuit",
        itemName: "M4 Circuit",
        serialNo: "M4CRCT0001",
        quantity: "1.000",
        voucherType: "Stock Entry",
        children: [
          {
            id: "41",
            rowNo: 41,
            itemCode: "M4 Chip",
            itemName: "M4 Chip",
            serialNo: "M4CHIP168",
            quantity: "1.000",
            voucherType: "Purchase Invoice",
          },
          {
            id: "42",
            rowNo: 42,
            itemCode: "M4 Motherboard",
            itemName: "M4 Motherbo...",
            serialNo: "M4MBD0001",
            quantity: "1.000",
            voucherType: "Purchase Invoice",
          },
        ],
      },
      {
        id: "43",
        rowNo: 43,
        itemCode: "M4 Body",
        itemName: "M4 Body",
        serialNo: "M4BODY0001",
        quantity: "1.000",
        voucherType: "Stock Entry",
        children: [
          {
            id: "44",
            rowNo: 44,
            itemCode: "M4 Screen",
            itemName: "M4 Screen",
            batchNo: "M4SN0001",
            quantity: "1.000",
            voucherType: "Stock Entry",
          },
          {
            id: "45",
            rowNo: 45,
            itemCode: "M4 Keypad",
            itemName: "M4 Keypad",
            serialNo: "M4KB0001",
            quantity: "1.000",
            voucherType: "Purchase Invoice",
          },
          {
            id: "46",
            rowNo: 46,
            itemCode: "M4 Body Raw",
            itemName: "M4 Body Raw",
            quantity: "1.000",
            voucherType: "",
          },
        ],
      },
      {
        id: "47",
        rowNo: 47,
        itemCode: "M4 Battery",
        itemName: "M4 Battery",
        serialNo: "M4BATY0001",
        quantity: "1.000",
        voucherType: "Purchase Invoice",
      },
      {
        id: "48",
        rowNo: 48,
        itemCode: "M4 Sensor",
        itemName: "M4 Sensor",
        batchNo: "M4SENA01",
        quantity: "1.000",
        voucherType: "Stock Entry",
      },
    ],
  },
  {
    id: "50",
    rowNo: 50,
    itemCode: "M4 MacBook Air",
    itemName: "M4 MacBook ...",
    serialNo: "MCBOOKAIR01",
    quantity: "1.000",
    voucherType: "Stock Entry",
  },
]

export function SerialBatchTraceabilityForm() {
  const [expandedNodes, setExpandedNodes] = React.useState<Record<string, boolean>>({
    "39": true,
    "40": true,
    "43": true,
  })
  const [showFilterRow, setShowFilterRow] = React.useState(true)

  const toggleNode = (id: string) => {
    setExpandedNodes((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  const collapseAll = () => {
    setExpandedNodes({})
  }

  const expandAll = () => {
    setExpandedNodes({
      "39": true,
      "40": true,
      "43": true,
    })
  }

  // Recursive Table Row Render
  const renderRows = (items: StockItem[], depth = 0): React.ReactNode => {
    return items.map((item) => {
      const hasChildren = item.children && item.children.length > 0
      const isExpanded = !!expandedNodes[item.id]

      return (
        <React.Fragment key={item.id}>
          <tr className="hover:bg-muted/30">
            <td className={cn(cellClass, rowIndexClass, "text-center")}>
              <div className="flex h-7 items-center justify-center font-medium">{item.rowNo}</div>
            </td>
            <td className={cellClass}>
              <div
                className="flex h-7 min-w-0 items-center gap-1.5 px-2"
                style={{ paddingLeft: `${depth * 16 + 8}px` }}
              >
                {hasChildren ? (
                  <button
                    onClick={() => toggleNode(item.id)}
                    className="size-4 shrink-0 inline-flex items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <ChevronDown
                      className={`size-3.5 transition-transform duration-150 ${
                        isExpanded ? "" : "-rotate-90"
                      }`}
                    />
                  </button>
                ) : (
                  <span className="size-4 shrink-0 inline-block" />
                )}
                <span className={hasChildren ? "truncate font-semibold text-foreground" : "truncate font-normal text-foreground"}>
                  {item.itemCode}
                </span>
              </div>
            </td>
            <td className={cellClass}>
              <div className="flex h-7 min-w-0 items-center truncate px-2 text-muted-foreground">{item.itemName}</div>
            </td>
            <td className={cellClass}>
              <div className="flex h-7 items-center truncate px-2 font-mono font-medium text-emerald-600 dark:text-emerald-400">
                {item.serialNo || ""}
              </div>
            </td>
            <td className={cellClass}>
              <div className="flex h-7 items-center truncate px-2 font-mono text-muted-foreground">{item.batchNo || ""}</div>
            </td>
            <td className={cellClass}>
              <div className="flex h-7 items-center truncate px-2 text-muted-foreground">{item.batchExpiryDate || ""}</div>
            </td>
            <td className={cellClass}>
              <div className="flex h-7 items-center justify-end px-2 font-medium text-foreground">{item.quantity}</div>
            </td>
            <td className={cellClass}>
              <div className="flex h-7 items-center truncate px-2 text-muted-foreground">{item.voucherType}</div>
            </td>
            <td className={cellClass}>
              <div className="flex h-7 items-center truncate px-2 text-muted-foreground">{item.sourceWarehouse || ""}</div>
            </td>
          </tr>

          {hasChildren && isExpanded && renderRows(item.children!, depth + 1)}
        </React.Fragment>
      )
    })
  }

  return (
    <WorkspacePageShell
      showSearch={false}
      breadcrumb={
        <Breadcrumb>
          <BreadcrumbList className="text-xs">
            <BreadcrumbItem className="hidden md:block">
              <BreadcrumbLink asChild>
                <Link to="/stock" state={{ yulaClosed: true }}>Stock</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator className="hidden md:block" />
            <BreadcrumbItem>
              <BreadcrumbPage className="font-semibold text-foreground">
                Serial No and Batch Traceability
              </BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      }
      actions={
        <>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1.5 px-2.5 text-xs font-normal"
              >
                <span>Actions</span>
                <ChevronDown className="size-3.5 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem>Export Traceability Report</DropdownMenuItem>
              <DropdownMenuItem>Print PDF</DropdownMenuItem>
              <DropdownMenuItem>Download Excel</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

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

          <AIChatAssistant />
        </>
      }
    >
      <div
        className={cn(
          pageContentGutterClass,
          "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
        )}
      >
        <div className={cn(panelCardClass, "min-h-0 flex-1")}>
        <div className={panelHeaderClass}>
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <div className="flex min-w-0 items-center gap-1.5">
              <FileText className={panelHeaderIconClass} aria-hidden />
              <span className={panelHeaderTitleClass}>
                Serial No and Batch Traceability
              </span>
            </div>
            <span className={panelHeaderSubtitleClass}>
              Item movement across batches and serials
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-1.5 self-center">
            <Button
              type="button"
              variant={showFilterRow ? "secondary" : "outline"}
              size="icon"
              className="size-7 shrink-0"
              onClick={() => setShowFilterRow((open) => !open)}
              title={showFilterRow ? "Hide filter row" : "Show filter row"}
              aria-label={showFilterRow ? "Hide filter row" : "Show filter row"}
            >
              <ListFilter className="size-3.5" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-7 shrink-0"
              aria-label="Refresh"
            >
              <RefreshCw className="size-3.5" />
            </Button>
          </div>
        </div>

        {/* Scrollable Traceability Table Area */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-md border border-border/60 bg-card">
          <div className="min-h-0 flex-1 overflow-auto">
            <div className="min-w-[42rem]">
              <div className="sticky top-0 z-10 bg-card">
                <table className="w-full table-fixed caption-bottom border-separate border-spacing-0 text-xs">
                  <colgroup>
                    <col style={{ width: 44 }} />
                    <col style={{ width: 200 }} />
                    <col style={{ width: 150 }} />
                    <col />
                    <col />
                    <col />
                    <col />
                    <col />
                    <col />
                  </colgroup>
                  <thead>
                    <tr>
                      <th className={cn(headClass, rowIndexClass, "text-center")}>No.</th>
                      <th className={headClass}>Item Code</th>
                      <th className={headClass}>Item Name</th>
                      <th className={headClass}>Serial No</th>
                      <th className={headClass}>Batch No</th>
                      <th className={headClass}>Batch Expiry Date</th>
                      <th className={cn(headClass, "text-right")}>Quantity</th>
                      <th className={headClass}>Voucher Type</th>
                      <th className={headClass}>Source Warehouse</th>
                    </tr>
                    {showFilterRow ? (
                    <tr>
                      <th className={cn(cellClass, rowIndexClass)} />
                      <th className={cellClass}>
                        <Input className={cellInputClass} placeholder="Filter…" />
                      </th>
                      <th className={cellClass}>
                        <Input className={cellInputClass} />
                      </th>
                      <th className={cellClass}>
                        <Input className={cellInputClass} />
                      </th>
                      <th className={cellClass}>
                        <Input className={cellInputClass} />
                      </th>
                      <th className={cellClass}>
                        <Input className={cellInputClass} />
                      </th>
                      <th className={cellClass}>
                        <Input className={cn(cellInputClass, "text-right")} />
                      </th>
                      <th className={cellClass}>
                        <Input className={cellInputClass} />
                      </th>
                      <th className={cellClass}>
                        <Input className={cellInputClass} />
                      </th>
                    </tr>
                    ) : null}
                  </thead>
                </table>
              </div>

              <table className="w-full table-fixed caption-bottom border-separate border-spacing-0 text-xs">
                <colgroup>
                  <col style={{ width: 44 }} />
                  <col style={{ width: 200 }} />
                  <col style={{ width: 150 }} />
                  <col />
                  <col />
                  <col />
                  <col />
                  <col />
                  <col />
                </colgroup>
                <tbody>
                  {renderRows(initialStockData)}
                </tbody>
              </table>
            </div>
          </div>

          {/* Bottom Controls & Info Bar */}
          <div className="flex shrink-0 flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-t border-border/60 bg-muted/10 px-2 py-1.5 text-xs">
            <div className="flex items-center gap-2">
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

            <div className="text-muted-foreground text-[11px] space-y-0.5">
              <p>For comparison, use &gt;5, &lt;10 or =324. For ranges, use 5:10 (for values between 5 & 10).</p>
              <p className="text-right">Execution Time: 0.037062 sec</p>
            </div>
          </div>
        </div>
      </div>
    </div>
    </WorkspacePageShell>
  )
}
