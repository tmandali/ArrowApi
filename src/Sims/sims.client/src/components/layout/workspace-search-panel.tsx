import { useLocation, useNavigate } from "react-router-dom"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
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
import { emptyModulePath } from "@/lib/empty-module"
import { cn } from "@/utils/cn"

function useWorkspaceSearchMeta() {
  const { pathname } = useLocation()

  const workspace =
    pathname.startsWith("/accounting")
      ? "accounting"
      : pathname.startsWith("/stock") || pathname === "/landed-cost-voucher"
        ? "stock"
        : pathname.startsWith("/manufacturing")
          ? "manufacturing"
          : "selling"

  const placeholder =
    workspace === "accounting"
      ? "Search Financial Reports..."
      : workspace === "stock"
        ? "Search Stock & Traceability..."
        : workspace === "manufacturing"
          ? "Search Manufacturing & BOM..."
          : "Search Subcontracting & Orders..."

  return { workspace, placeholder }
}

type WorkspaceSearchItemsProps = {
  onSelect: (url: string) => void
}

/** Command groups for the active workspace. Must render inside a Command root. */
export function WorkspaceSearchItems({ onSelect }: WorkspaceSearchItemsProps) {
  const { workspace } = useWorkspaceSearchMeta()
  const e = emptyModulePath

  if (workspace === "accounting") {
    return (
      <>
        <CommandGroup heading="Financial Reports Pages">
          <CommandItem onSelect={() => onSelect("/accounting")}>
            <BarChart2 className="mr-2 size-4" />
            <span>Consolidated Report</span>
            <CommandShortcut>↵</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => onSelect(e("accounting", "Balance Sheet"))}>
            <FileText className="mr-2 size-4" />
            <span>Balance Sheet</span>
          </CommandItem>
          <CommandItem
            onSelect={() => onSelect(e("accounting", "Profit and Loss"))}
          >
            <TrendingUp className="mr-2 size-4" />
            <span>Profit and Loss</span>
          </CommandItem>
          <CommandItem onSelect={() => onSelect(e("accounting", "Cash Flow"))}>
            <DollarSign className="mr-2 size-4" />
            <span>Cash Flow</span>
          </CommandItem>
        </CommandGroup>
        <CommandGroup heading="Ledgers">
          <CommandItem
            onSelect={() => onSelect(e("accounting", "General Ledger"))}
          >
            <BookOpen className="mr-2 size-4" />
            <span>General Ledger</span>
          </CommandItem>
          <CommandItem
            onSelect={() => onSelect(e("accounting", "Customer Ledger"))}
          >
            <BookOpen className="mr-2 size-4" />
            <span>Customer Ledger</span>
          </CommandItem>
          <CommandItem
            onSelect={() => onSelect(e("accounting", "Supplier Ledger"))}
          >
            <BookOpen className="mr-2 size-4" />
            <span>Supplier Ledger</span>
          </CommandItem>
        </CommandGroup>
      </>
    )
  }

  if (workspace === "stock") {
    return (
      <>
        <CommandGroup heading="Stock Pages">
          <CommandItem onSelect={() => onSelect("/stock")}>
            <Package className="mr-2 size-4" />
            <span>Stock Dashboard</span>
            <CommandShortcut>↵</CommandShortcut>
          </CommandItem>
          <CommandItem
            onSelect={() => onSelect("/stock/serial-batch-traceability")}
          >
            <Package className="mr-2 size-4" />
            <span>Serial No and Batch Traceability</span>
          </CommandItem>
          <CommandItem onSelect={() => onSelect(e("stock", "Stock Entry"))}>
            <Receipt className="mr-2 size-4" />
            <span>Stock Entry</span>
          </CommandItem>
          <CommandItem onSelect={() => onSelect(e("stock", "Delivery Note"))}>
            <Truck className="mr-2 size-4" />
            <span>Delivery Note</span>
          </CommandItem>
          <CommandItem
            onSelect={() => onSelect(e("stock", "Stock Reconciliation"))}
          >
            <Scale className="mr-2 size-4" />
            <span>Stock Reconciliation</span>
          </CommandItem>
          <CommandItem onSelect={() => onSelect(e("stock", "Material Request"))}>
            <Send className="mr-2 size-4" />
            <span>Material Request</span>
          </CommandItem>
        </CommandGroup>
        <CommandGroup heading="Stock Reports">
          <CommandItem onSelect={() => onSelect("/stock/stock-ledger")}>
            <BarChart2 className="mr-2 size-4" />
            <span>Stock Ledger</span>
          </CommandItem>
          <CommandItem onSelect={() => onSelect("/stock/stock-balance")}>
            <BarChart2 className="mr-2 size-4" />
            <span>Stock Balance</span>
          </CommandItem>
          <CommandItem onSelect={() => onSelect("/stock/stock-analytics")}>
            <BarChart2 className="mr-2 size-4" />
            <span>Stock Analytics</span>
          </CommandItem>
        </CommandGroup>
      </>
    )
  }

  if (workspace === "manufacturing") {
    return (
      <>
        <CommandGroup heading="Manufacturing Settings & Forms">
          <CommandItem onSelect={() => onSelect("/manufacturing")}>
            <Settings className="mr-2 size-4" />
            <span>Stock Settings</span>
            <CommandShortcut>↵</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => onSelect(e("manufacturing", "BOM"))}>
            <FileText className="mr-2 size-4" />
            <span>BOM (Bill of Materials)</span>
          </CommandItem>
          <CommandItem
            onSelect={() => onSelect(e("manufacturing", "Work Order"))}
          >
            <Factory className="mr-2 size-4" />
            <span>Work Order</span>
          </CommandItem>
          <CommandItem onSelect={() => onSelect(e("manufacturing", "Job Card"))}>
            <UserCheck className="mr-2 size-4" />
            <span>Job Card</span>
          </CommandItem>
          <CommandItem
            onSelect={() => onSelect(e("manufacturing", "Production Plan"))}
          >
            <Wrench className="mr-2 size-4" />
            <span>Material Planning</span>
          </CommandItem>
        </CommandGroup>
      </>
    )
  }

  return (
    <>
      <CommandGroup heading="Subcontracting Pages">
        <CommandItem onSelect={() => onSelect("/selling")}>
          <ArrowRight className="mr-2 size-4" />
          <span>Sales Order (Subcontracting)</span>
          <CommandShortcut>↵</CommandShortcut>
        </CommandItem>
        <CommandItem
          onSelect={() => onSelect(e("selling", "Inward Subcontracting Order"))}
        >
          <FileText className="mr-2 size-4" />
          <span>Subcontracting Order</span>
        </CommandItem>
        <CommandItem
          onSelect={() => onSelect(e("selling", "Subcontracting Delivery"))}
        >
          <Truck className="mr-2 size-4" />
          <span>Subcontracting Delivery</span>
        </CommandItem>
      </CommandGroup>
      <CommandGroup heading="Outward Orders">
        <CommandItem onSelect={() => onSelect(e("selling", "Purchase Order"))}>
          <Receipt className="mr-2 size-4" />
          <span>Purchase Order</span>
        </CommandItem>
        <CommandItem
          onSelect={() => onSelect(e("selling", "Subcontracting Receipt"))}
        >
          <Receipt className="mr-2 size-4" />
          <span>Subcontracting Receipt</span>
        </CommandItem>
      </CommandGroup>
    </>
  )
}

type WorkspaceSearchResultsProps = {
  onSelect: (url: string) => void
  className?: string
  listClassName?: string
  showFooter?: boolean
}

/** Results list only — must be inside an existing Command root. */
export function WorkspaceSearchResults({
  onSelect,
  className,
  listClassName,
  showFooter = true,
}: WorkspaceSearchResultsProps) {
  return (
    <div className={cn("overflow-hidden", className)}>
      <CommandList className={cn("max-h-72", listClassName)}>
        <CommandEmpty>No results found for this workspace.</CommandEmpty>
        <WorkspaceSearchItems onSelect={onSelect} />
      </CommandList>
      {showFooter ? (
        <div className="flex items-center justify-between border-t bg-muted/20 p-2 text-[11px] text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <CornerDownLeft className="size-3" />
            <span>Go to Page</span>
          </div>
          <span className="font-mono text-[10px]">ESC to close</span>
        </div>
      ) : null}
    </div>
  )
}

type WorkspaceSearchPanelProps = {
  onSelect: (url: string) => void
  className?: string
  listClassName?: string
  showFooter?: boolean
}

/** Self-contained Command panel with embedded search input (dialog fallback). */
export function WorkspaceSearchPanel({
  onSelect,
  className,
  listClassName,
  showFooter = true,
}: WorkspaceSearchPanelProps) {
  const { placeholder } = useWorkspaceSearchMeta()

  return (
    <Command className={cn("rounded-lg", className)}>
      <CommandInput placeholder={placeholder} />
      <WorkspaceSearchResults
        onSelect={onSelect}
        listClassName={listClassName}
        showFooter={showFooter}
      />
    </Command>
  )
}

export function useWorkspaceSearchNavigate(
  onOpenChange: (open: boolean) => void
) {
  const navigate = useNavigate()

  return (url: string) => {
    onOpenChange(false)
    if (url && url !== "#") {
      navigate(url)
    }
  }
}

export { useWorkspaceSearchMeta }
