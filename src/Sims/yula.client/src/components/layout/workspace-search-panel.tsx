"use client";

import * as React from "react";

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command"
import { Badge } from "@/components/ui/badge"
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
  Sparkles,
  Loader2,
  MessageSquare,
  Search,
} from "lucide-react"
import { emptyModulePath } from "@/lib/workspace-paths"
import { workspaceDashboardPath } from "@/lib/workspace-nav"
import { useWorkspaceSearchMeta } from "@/components/layout/workspace-search-hooks"
import { useWorkspaceRagSearch } from "@/hooks/use-workspace-rag-search"
import { cn } from "@/utils/cn"

type WorkspaceSearchItemsProps = {
  onSelect: (url: string) => void
}

function getCategoryIcon(category: string, isRag = false) {
  if (isRag) {
    return <Sparkles className="size-3.5 shrink-0 text-amber-500/90 group-hover:text-amber-600 dark:text-amber-400" />
  }
  switch (category) {
    case "Katalog":
      return <Package className="size-3.5 shrink-0 text-muted-foreground/60 group-hover:text-foreground transition-colors" />
    case "İşlemler":
      return <Receipt className="size-3.5 shrink-0 text-muted-foreground/60 group-hover:text-foreground transition-colors" />
    case "Raporlar":
      return <BarChart2 className="size-3.5 shrink-0 text-muted-foreground/60 group-hover:text-foreground transition-colors" />
    case "Ayarlar":
      return <Settings className="size-3.5 shrink-0 text-muted-foreground/60 group-hover:text-foreground transition-colors" />
    case "Seri & Parti":
      return <Scale className="size-3.5 shrink-0 text-muted-foreground/60 group-hover:text-foreground transition-colors" />
    case "Araçlar":
      return <Wrench className="size-3.5 shrink-0 text-muted-foreground/60 group-hover:text-foreground transition-colors" />
    default:
      return <Package className="size-3.5 shrink-0 text-muted-foreground/60 group-hover:text-foreground transition-colors" />
  }
}

/** Command groups for the active workspace. Must render inside a Command root. */
export function WorkspaceSearchItems({ onSelect }: WorkspaceSearchItemsProps) {
  const { workspace } = useWorkspaceSearchMeta()
  const e = emptyModulePath

  if (workspace === "accounting") {
    return (
      <>
        <CommandGroup heading="FINANCIAL REPORTS PAGES" className="px-1 py-1">
          <CommandItem onSelect={() => onSelect("/accounting")} className="group relative flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs transition-colors cursor-pointer text-muted-foreground/80 hover:bg-muted/40 hover:text-foreground">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <BarChart2 className="size-3.5 shrink-0 text-muted-foreground/50 group-hover:text-foreground" />
              <span className="truncate text-[11.5px] leading-tight font-normal">Consolidated Report</span>
            </div>
            <CommandShortcut className="text-[10px]">↵</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => onSelect(e("accounting", "Balance Sheet"))} className="group relative flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs transition-colors cursor-pointer text-muted-foreground/80 hover:bg-muted/40 hover:text-foreground">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <FileText className="size-3.5 shrink-0 text-muted-foreground/50 group-hover:text-foreground" />
              <span className="truncate text-[11.5px] leading-tight font-normal">Balance Sheet</span>
            </div>
          </CommandItem>
          <CommandItem onSelect={() => onSelect(e("accounting", "Profit and Loss"))} className="group relative flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs transition-colors cursor-pointer text-muted-foreground/80 hover:bg-muted/40 hover:text-foreground">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <TrendingUp className="size-3.5 shrink-0 text-muted-foreground/50 group-hover:text-foreground" />
              <span className="truncate text-[11.5px] leading-tight font-normal">Profit and Loss</span>
            </div>
          </CommandItem>
          <CommandItem onSelect={() => onSelect(e("accounting", "Cash Flow"))} className="group relative flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs transition-colors cursor-pointer text-muted-foreground/80 hover:bg-muted/40 hover:text-foreground">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <DollarSign className="size-3.5 shrink-0 text-muted-foreground/50 group-hover:text-foreground" />
              <span className="truncate text-[11.5px] leading-tight font-normal">Cash Flow</span>
            </div>
          </CommandItem>
        </CommandGroup>
      </>
    )
  }

  if (workspace === "stock") {
    return (
      <>
        <CommandGroup heading="STOK SAYFALARI" className="px-1 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">
          <CommandItem onSelect={() => onSelect(workspaceDashboardPath)} className="group relative flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs transition-colors cursor-pointer text-muted-foreground/80 hover:bg-muted/40 hover:text-foreground">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <Package className="size-3.5 shrink-0 text-muted-foreground/50 group-hover:text-foreground" />
              <span className="truncate text-[11.5px] leading-tight font-normal">Stock Dashboard</span>
            </div>
            <CommandShortcut className="text-[10px]">↵</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => onSelect("/stock/serial-batch-traceability")} className="group relative flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs transition-colors cursor-pointer text-muted-foreground/80 hover:bg-muted/40 hover:text-foreground">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <Scale className="size-3.5 shrink-0 text-muted-foreground/50 group-hover:text-foreground" />
              <span className="truncate text-[11.5px] leading-tight font-normal">Serial No and Batch Traceability</span>
            </div>
          </CommandItem>
          <CommandItem onSelect={() => onSelect(e("stock", "Stock Entry"))} className="group relative flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs transition-colors cursor-pointer text-muted-foreground/80 hover:bg-muted/40 hover:text-foreground">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <Receipt className="size-3.5 shrink-0 text-muted-foreground/50 group-hover:text-foreground" />
              <span className="truncate text-[11.5px] leading-tight font-normal">Stock Entry</span>
            </div>
          </CommandItem>
          <CommandItem onSelect={() => onSelect(e("stock", "Delivery Note"))} className="group relative flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs transition-colors cursor-pointer text-muted-foreground/80 hover:bg-muted/40 hover:text-foreground">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <Truck className="size-3.5 shrink-0 text-muted-foreground/50 group-hover:text-foreground" />
              <span className="truncate text-[11.5px] leading-tight font-normal">Delivery Note</span>
            </div>
          </CommandItem>
        </CommandGroup>

        <CommandGroup heading="STOK RAPORLARI" className="px-1 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">
          <CommandItem onSelect={() => onSelect("/stock/stock-ledger")} className="group relative flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs transition-colors cursor-pointer text-muted-foreground/80 hover:bg-muted/40 hover:text-foreground">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <BarChart2 className="size-3.5 shrink-0 text-muted-foreground/50 group-hover:text-foreground" />
              <span className="truncate text-[11.5px] leading-tight font-normal">Stock Ledger</span>
            </div>
          </CommandItem>
          <CommandItem onSelect={() => onSelect("/stock/stock-balance")} className="group relative flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs transition-colors cursor-pointer text-muted-foreground/80 hover:bg-muted/40 hover:text-foreground">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <BarChart2 className="size-3.5 shrink-0 text-muted-foreground/50 group-hover:text-foreground" />
              <span className="truncate text-[11.5px] leading-tight font-normal">Stock Balance</span>
            </div>
          </CommandItem>
          <CommandItem onSelect={() => onSelect("/stock/stock-analytics")} className="group relative flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs transition-colors cursor-pointer text-muted-foreground/80 hover:bg-muted/40 hover:text-foreground">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <BarChart2 className="size-3.5 shrink-0 text-muted-foreground/50 group-hover:text-foreground" />
              <span className="truncate text-[11.5px] leading-tight font-normal">Stock Analytics</span>
            </div>
          </CommandItem>
        </CommandGroup>
      </>
    )
  }

  return (
    <CommandGroup heading="GENEL SAYFALAR" className="px-1 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">
      <CommandItem onSelect={() => onSelect("/stock")} className="group relative flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs transition-colors cursor-pointer text-muted-foreground/80 hover:bg-muted/40 hover:text-foreground">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <Package className="size-3.5 shrink-0 text-muted-foreground/50 group-hover:text-foreground" />
          <span className="truncate text-[11.5px] leading-tight font-normal">Stock Main</span>
        </div>
      </CommandItem>
    </CommandGroup>
  )
}

type WorkspaceSearchResultsProps = {
  onSelect: (url: string) => void
  query?: string
  className?: string
  listClassName?: string
  showFooter?: boolean
}

/** Results list styled exactly like Yula AI History Sidebar — must be inside an existing Command root. */
export function WorkspaceSearchResults({
  onSelect,
  query = "",
  className,
  listClassName,
  showFooter = true,
}: WorkspaceSearchResultsProps) {
  const { workspace } = useWorkspaceSearchMeta()
  const { groupedResults, results, isSearching } = useWorkspaceRagSearch(query, workspace)

  const hasQuery = query.trim().length > 0

  return (
    <div className={cn("overflow-hidden select-none bg-popover/95 backdrop-blur-sm text-popover-foreground shadow-xl border border-border/40 rounded-xl", className)}>
      {/* Header bar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/30 bg-muted/20 text-[10.5px] font-medium text-muted-foreground/70">
        <div className="flex items-center gap-1.5">
          <Sparkles className="size-3 text-amber-500" />
          <span>Modül & Menü Arama</span>
        </div>
        {isSearching ? (
          <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400 font-medium text-[10px]">
            <Loader2 className="size-3 animate-spin" /> Aranıyor...
          </span>
        ) : (
          <span className="text-[10px] text-muted-foreground/60">{results.length} öğe</span>
        )}
      </div>

      <CommandList className={cn("max-h-80 overflow-y-auto p-1.5 space-y-2 overscroll-contain no-scrollbar", listClassName)}>
        {results.length === 0 && !isSearching ? (
          <CommandEmpty className="py-8 text-center text-xs text-muted-foreground/70 font-medium flex flex-col items-center justify-center gap-2">
            <MessageSquare className="size-6 text-muted-foreground/30" />
            <p className="max-w-[220px]">
              {hasQuery
                ? `"${query}" ile eşleşen modül veya menü öğesi bulunamadı.`
                : "Bu alanda görüntülenecek menü öğesi bulunamadı."}
            </p>
          </CommandEmpty>
        ) : null}

        {groupedResults.map((group) => (
          <CommandGroup
            key={group.category}
            heading={group.category.toUpperCase()}
            className="px-1 py-0.5 space-y-0.5"
          >
            {group.items.map((item) => (
              <CommandItem
                key={item.id}
                value={`${item.title} ${item.titleTr} ${item.category}`}
                onSelect={() => onSelect(item.url)}
                className="group relative flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs transition-colors cursor-pointer text-muted-foreground/80 hover:bg-muted/40 hover:text-foreground data-[selected=true]:bg-primary/10 data-[selected=true]:text-primary"
              >
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  {getCategoryIcon(item.category, !item.isExactMatch)}
                  <div className="flex flex-col min-w-0">
                    <span className="truncate text-[11.5px] leading-tight font-normal text-foreground/90 group-hover:text-foreground">
                      {item.title}
                    </span>
                    {item.titleTr && item.titleTr !== item.title ? (
                      <span className="text-[10px] text-muted-foreground/60 truncate font-normal">
                        {item.titleTr}
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0 ml-2">
                  {item.isExactMatch ? (
                    <Badge variant="outline" className="border-emerald-500/20 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 text-[9px] px-1.5 py-0.5 font-medium rounded-md">
                      {item.category}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="border-amber-500/25 text-amber-600 dark:text-amber-400 bg-amber-500/10 text-[9px] px-1.5 py-0.5 font-medium rounded-md flex items-center gap-1">
                      <Sparkles className="size-2.5" /> %{item.score} Eşleşme
                    </Badge>
                  )}
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
      </CommandList>

      {showFooter ? (
        <div className="shrink-0 px-3 py-2 flex items-center justify-between text-[11px] text-muted-foreground/60 border-t border-border/30 bg-transparent">
          <div className="flex items-center gap-1.5">
            <CornerDownLeft className="size-3 text-muted-foreground/50" />
            <span>Sayfaya gitmek için tıklayın veya Enter'a basın</span>
          </div>
          <span className="font-mono text-[9.5px] text-muted-foreground/50">ESC</span>
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
  const [query, setQuery] = React.useState("")

  return (
    <Command shouldFilter={false} className={cn("rounded-xl border-0 shadow-2xl overflow-hidden", className)}>
      <CommandInput
        value={query}
        onValueChange={setQuery}
        placeholder={placeholder}
      />
      <WorkspaceSearchResults
        query={query}
        onSelect={onSelect}
        listClassName={listClassName}
        showFooter={showFooter}
      />
    </Command>
  )
}
