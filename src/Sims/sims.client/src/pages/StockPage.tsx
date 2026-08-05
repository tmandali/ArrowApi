import * as React from "react"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Input } from "@/components/ui/input"
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
  ChevronDown,
  RefreshCw,
  MoreHorizontal,
} from "lucide-react"

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

export default function StockPage() {
  const [expandedNodes, setExpandedNodes] = React.useState<Record<string, boolean>>({
    "39": true,
    "40": true,
    "43": true,
  })

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
          <TableRow className="hover:bg-muted/30 text-xs transition-colors">
            <TableCell className="py-2 w-12 text-muted-foreground">{item.rowNo}</TableCell>
            <TableCell className="py-2 font-medium">
              <div className="flex items-center gap-1.5" style={{ paddingLeft: `${depth * 16}px` }}>
                {hasChildren ? (
                  <button
                    onClick={() => toggleNode(item.id)}
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
                <span className={hasChildren ? "font-semibold text-foreground" : "text-foreground font-normal"}>
                  {item.itemCode}
                </span>
              </div>
            </TableCell>
            <TableCell className="py-2 text-muted-foreground">{item.itemName}</TableCell>
            <TableCell className="py-2 font-mono font-medium text-emerald-600 dark:text-emerald-400">
              {item.serialNo || ""}
            </TableCell>
            <TableCell className="py-2 font-mono text-muted-foreground">{item.batchNo || ""}</TableCell>
            <TableCell className="py-2 text-muted-foreground">{item.batchExpiryDate || ""}</TableCell>
            <TableCell className="py-2 text-right font-medium text-foreground">{item.quantity}</TableCell>
            <TableCell className="py-2 text-muted-foreground">{item.voucherType}</TableCell>
            <TableCell className="py-2 text-muted-foreground">{item.sourceWarehouse || ""}</TableCell>
          </TableRow>

          {hasChildren && isExpanded && renderRows(item.children!, depth + 1)}
        </React.Fragment>
      )
    })
  }

  return (
    <>
      {/* Header Navigation & Actions */}
      <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center justify-between gap-2 border-b bg-background/95 backdrop-blur px-4 text-xs">
          <div className="flex items-center gap-2 overflow-hidden">
            <SidebarTrigger className="-ml-1" />
            <Separator
              orientation="vertical"
              className="mr-2 data-vertical:h-4 data-vertical:self-auto"
            />
            <Breadcrumb>
              <BreadcrumbList className="text-xs">
                <BreadcrumbItem>
                  <BreadcrumbPage className="font-semibold text-foreground">
                    Stock
                  </BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>

          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-7 text-xs font-normal gap-1.5 px-2.5">
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
          </div>
        </header>

        {/* Filter Controls Row */}
        <div className="p-4 border-b bg-muted/10">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <Input
              defaultValue="M4 MacBook Air"
              className="h-8 text-xs bg-muted/30 border-muted-foreground/20 font-medium"
              placeholder="Item Code"
            />
            <Input
              placeholder="Batch No"
              className="h-8 text-xs bg-muted/20 border-muted-foreground/20"
            />
            <Input
              placeholder="Serial No"
              className="h-8 text-xs bg-muted/20 border-muted-foreground/20"
            />
            <Select defaultValue="backward">
              <SelectTrigger className="h-8 text-xs bg-muted/30 border-muted-foreground/20">
                <SelectValue placeholder="Direction" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="backward">Backward</SelectItem>
                <SelectItem value="forward">Forward</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Scrollable Traceability Table Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="rounded-md border bg-card overflow-hidden">
            <Table>
              <TableHeader className="bg-muted/40 text-xs">
                {/* Column Titles */}
                <TableRow className="border-b hover:bg-transparent">
                  <TableHead className="w-12 font-semibold text-foreground py-2.5">No.</TableHead>
                  <TableHead className="font-semibold text-foreground py-2.5">Item Code</TableHead>
                  <TableHead className="font-semibold text-foreground py-2.5">Item Name</TableHead>
                  <TableHead className="font-semibold text-foreground py-2.5">Serial No</TableHead>
                  <TableHead className="font-semibold text-foreground py-2.5">Batch No</TableHead>
                  <TableHead className="font-semibold text-foreground py-2.5">Batch Expiry Date</TableHead>
                  <TableHead className="font-semibold text-foreground text-right py-2.5">Quantity</TableHead>
                  <TableHead className="font-semibold text-foreground py-2.5">Voucher Type</TableHead>
                  <TableHead className="font-semibold text-foreground py-2.5">Source Warehouse</TableHead>
                </TableRow>

                {/* Search Filters Row */}
                <TableRow className="border-b bg-muted/10 hover:bg-transparent">
                  <TableHead className="p-1.5"></TableHead>
                  <TableHead className="p-1.5">
                    <Input className="h-7 text-xs bg-muted/20 border-muted-foreground/20" />
                  </TableHead>
                  <TableHead className="p-1.5">
                    <Input className="h-7 text-xs bg-muted/20 border-muted-foreground/20" />
                  </TableHead>
                  <TableHead className="p-1.5">
                    <Input className="h-7 text-xs bg-muted/20 border-muted-foreground/20" />
                  </TableHead>
                  <TableHead className="p-1.5">
                    <Input className="h-7 text-xs bg-muted/20 border-muted-foreground/20" />
                  </TableHead>
                  <TableHead className="p-1.5">
                    <Input className="h-7 text-xs bg-muted/20 border-muted-foreground/20" />
                  </TableHead>
                  <TableHead className="p-1.5">
                    <Input className="h-7 text-xs bg-muted/20 border-muted-foreground/20 text-right" />
                  </TableHead>
                  <TableHead className="p-1.5">
                    <Input className="h-7 text-xs bg-muted/20 border-muted-foreground/20" />
                  </TableHead>
                  <TableHead className="p-1.5">
                    <Input className="h-7 text-xs bg-muted/20 border-muted-foreground/20" />
                  </TableHead>
                </TableRow>
              </TableHeader>

              <TableBody className="divide-y">
                {renderRows(initialStockData)}
              </TableBody>
            </Table>
          </div>

          {/* Bottom Controls & Info Bar */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs pt-2">
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
    </>
  )
}
