import * as React from "react"
import { useLocation, useNavigate } from "react-router-dom"
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
} from "@/components/ui/command"
import {
  ArrowRight,
  FileText,
  Package,
  Factory,
  BarChart2,
  BookOpen,
  DollarSign,
  TrendingUp,
  Receipt,
  Truck,
  Scale,
  Send,
  UserCheck,
  Wrench,
  Settings,
  CornerDownLeft,
} from "lucide-react"

interface WorkspaceSearchDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function WorkspaceSearchDialog({
  open,
  onOpenChange,
}: WorkspaceSearchDialogProps) {
  const { pathname } = useLocation()
  const navigate = useNavigate()

  const handleSelect = (url: string) => {
    onOpenChange(false)
    if (url && url !== "#") {
      navigate(url)
    }
  }

  // Define workspace-specific search categories & options based on route
  const getSearchContent = () => {
    if (pathname === "/accounting") {
      return (
        <>
          <CommandGroup heading="Financial Reports Pages">
            <CommandItem onSelect={() => handleSelect("/accounting")}>
              <BarChart2 className="size-4 mr-2" />
              <span>Consolidated Report</span>
              <CommandShortcut>↵</CommandShortcut>
            </CommandItem>
            <CommandItem onSelect={() => handleSelect("/empty")}>
              <FileText className="size-4 mr-2" />
              <span>Balance Sheet</span>
            </CommandItem>
            <CommandItem onSelect={() => handleSelect("/empty")}>
              <TrendingUp className="size-4 mr-2" />
              <span>Profit and Loss</span>
            </CommandItem>
            <CommandItem onSelect={() => handleSelect("/empty")}>
              <DollarSign className="size-4 mr-2" />
              <span>Cash Flow</span>
            </CommandItem>
          </CommandGroup>
          <CommandGroup heading="Ledgers">
            <CommandItem onSelect={() => handleSelect("/empty")}>
              <BookOpen className="size-4 mr-2" />
              <span>General Ledger</span>
            </CommandItem>
            <CommandItem onSelect={() => handleSelect("/empty")}>
              <BookOpen className="size-4 mr-2" />
              <span>Customer Ledger</span>
            </CommandItem>
            <CommandItem onSelect={() => handleSelect("/empty")}>
              <BookOpen className="size-4 mr-2" />
              <span>Supplier Ledger</span>
            </CommandItem>
          </CommandGroup>
        </>
      )
    }

    if (pathname === "/stock") {
      return (
        <>
          <CommandGroup heading="Stock Pages">
            <CommandItem onSelect={() => handleSelect("/stock")}>
              <Package className="size-4 mr-2" />
              <span>Serial No and Batch Traceability</span>
              <CommandShortcut>↵</CommandShortcut>
            </CommandItem>
            <CommandItem onSelect={() => handleSelect("/empty")}>
              <Receipt className="size-4 mr-2" />
              <span>Stock Entry</span>
            </CommandItem>
            <CommandItem onSelect={() => handleSelect("/empty")}>
              <Truck className="size-4 mr-2" />
              <span>Delivery Note</span>
            </CommandItem>
            <CommandItem onSelect={() => handleSelect("/empty")}>
              <Scale className="size-4 mr-2" />
              <span>Stock Reconciliation</span>
            </CommandItem>
            <CommandItem onSelect={() => handleSelect("/empty")}>
              <Send className="size-4 mr-2" />
              <span>Material Request</span>
            </CommandItem>
          </CommandGroup>
          <CommandGroup heading="Stock Reports">
            <CommandItem onSelect={() => handleSelect("/stock/stock-ledger")}>
              <BarChart2 className="size-4 mr-2" />
              <span>Stock Ledger</span>
            </CommandItem>
            <CommandItem onSelect={() => handleSelect("/empty")}>
              <BarChart2 className="size-4 mr-2" />
              <span>Stock Balance</span>
            </CommandItem>
            <CommandItem onSelect={() => handleSelect("/stock/stock-analytics")}>
              <BarChart2 className="size-4 mr-2" />
              <span>Stock Analytics</span>
            </CommandItem>
          </CommandGroup>
        </>
      )
    }

    if (pathname === "/manufacturing") {
      return (
        <>
          <CommandGroup heading="Manufacturing Settings & Forms">
            <CommandItem onSelect={() => handleSelect("/manufacturing")}>
              <Settings className="size-4 mr-2" />
              <span>Stock Settings</span>
              <CommandShortcut>↵</CommandShortcut>
            </CommandItem>
            <CommandItem onSelect={() => handleSelect("/empty")}>
              <FileText className="size-4 mr-2" />
              <span>BOM (Bill of Materials)</span>
            </CommandItem>
            <CommandItem onSelect={() => handleSelect("/empty")}>
              <Factory className="size-4 mr-2" />
              <span>Work Order</span>
            </CommandItem>
            <CommandItem onSelect={() => handleSelect("/empty")}>
              <UserCheck className="size-4 mr-2" />
              <span>Job Card</span>
            </CommandItem>
            <CommandItem onSelect={() => handleSelect("/empty")}>
              <Wrench className="size-4 mr-2" />
              <span>Material Planning</span>
            </CommandItem>
          </CommandGroup>
        </>
      )
    }

    // Default: Subcontracting / Selling Workspace (/selling)
    return (
      <>
        <CommandGroup heading="Subcontracting Pages">
          <CommandItem onSelect={() => handleSelect("/selling")}>
            <ArrowRight className="size-4 mr-2" />
            <span>Sales Order (Subcontracting)</span>
            <CommandShortcut>↵</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => handleSelect("/empty")}>
            <FileText className="size-4 mr-2" />
            <span>Subcontracting Order</span>
          </CommandItem>
          <CommandItem onSelect={() => handleSelect("/empty")}>
            <Truck className="size-4 mr-2" />
            <span>Subcontracting Delivery</span>
          </CommandItem>
        </CommandGroup>
        <CommandGroup heading="Outward Orders">
          <CommandItem onSelect={() => handleSelect("/empty")}>
            <Receipt className="size-4 mr-2" />
            <span>Purchase Order</span>
          </CommandItem>
          <CommandItem onSelect={() => handleSelect("/empty")}>
            <Receipt className="size-4 mr-2" />
            <span>Subcontracting Receipt</span>
          </CommandItem>
        </CommandGroup>
      </>
    )
  }

  const getPlaceholder = () => {
    if (pathname === "/accounting") return "Search Financial Reports..."
    if (pathname === "/stock") return "Search Stock & Traceability..."
    if (pathname === "/manufacturing") return "Search Manufacturing & BOM..."
    return "Search Subcontracting & Orders..."
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Search Documentation"
      description="Quick search for pages and commands in the current workspace"
    >
      <CommandInput placeholder={getPlaceholder()} />
      <CommandList className="max-h-[320px] p-2">
        <CommandEmpty>No results found for this workspace.</CommandEmpty>
        {getSearchContent()}
      </CommandList>
      <div className="flex items-center justify-between border-t p-2 text-[11px] text-muted-foreground bg-muted/20">
        <div className="flex items-center gap-1.5">
          <CornerDownLeft className="size-3" />
          <span>Go to Page</span>
        </div>
        <span className="font-mono text-[10px]">ESC to close</span>
      </div>
    </CommandDialog>
  )
}
