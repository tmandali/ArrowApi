"use client";

import * as React from "react";
import { useLocale, useTranslations } from "next-intl";

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
  FileText,
  Package,
  BarChart2,
  DollarSign,
  TrendingUp,
  Receipt,
  Truck,
  Scale,
  Wrench,
  Settings,
  CornerDownLeft,
  Sparkles,
  Loader2,
  MessageSquare,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import {
  DEFAULT_WORKSPACE_QUICK_ITEMS,
  WORKSPACE_QUICK_ITEMS,
  type WorkspaceQuickItem,
} from "@/lib/workspace-search-catalog"
import { resolveCategoryLabel, useWorkspaceSearchMeta } from "@/components/layout/workspace-search-hooks"
import { useWorkspaceRagSearch } from "@/hooks/use-workspace-rag-search"
import { cn } from "@/utils/cn"

/** Quick item ikon haritası — katalog `icon` alanı Lucide adıdır; bilineni kullanılır, olmayan Package düşer. */
const QUICK_ITEM_ICONS: Record<string, LucideIcon> = {
  Package,
  FileText,
  BarChart2,
  DollarSign,
  TrendingUp,
  Receipt,
  Truck,
  Scale,
}

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

/**
 * Quick items — veri sahibi `workspace-search-catalog` (`WORKSPACE_QUICK_ITEMS`);
 * panel yalnızca render eder. Tanımsız workspace → `DEFAULT_WORKSPACE_QUICK_ITEMS`.
 */
export function WorkspaceSearchItems({ onSelect }: WorkspaceSearchItemsProps) {
  const { workspace } = useWorkspaceSearchMeta()
  const groups = WORKSPACE_QUICK_ITEMS[workspace] ?? DEFAULT_WORKSPACE_QUICK_ITEMS

  return (
    <>
      {groups.map((group) => (
        <CommandGroup
          key={group.heading}
          heading={group.heading}
          className="px-1 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50"
        >
          {group.items.map((item: WorkspaceQuickItem) => {
            const Icon = QUICK_ITEM_ICONS[item.icon ?? ""] ?? Package
            return (
              <CommandItem
                key={item.url}
                onSelect={() => onSelect(item.url)}
                className="group relative flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs transition-colors cursor-pointer text-muted-foreground/80 hover:bg-muted/40 hover:text-foreground"
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <Icon className="size-3.5 shrink-0 text-muted-foreground/50 group-hover:text-foreground" />
                  <span className="truncate text-[11.5px] leading-tight font-normal">{item.title}</span>
                </div>
                {item.shortcut ? (
                  <CommandShortcut className="text-[10px]">{item.shortcut}</CommandShortcut>
                ) : null}
              </CommandItem>
            )
          })}
        </CommandGroup>
      ))}
    </>
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
  const t = useTranslations("SearchMainView")
  const tCat = useTranslations("SearchCats")
  const locale = useLocale()
  const isTr = locale === "tr"
  const { workspace } = useWorkspaceSearchMeta()
  const { groupedResults, results, isSearching } = useWorkspaceRagSearch(query, workspace)

  const hasQuery = query.trim().length > 0

  return (
    <div className={cn("overflow-hidden select-none bg-popover/95 backdrop-blur-sm text-popover-foreground shadow-xl border border-border/40 rounded-xl", className)}>
      {/* Header bar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/30 bg-muted/20 text-[10.5px] font-medium text-muted-foreground/70">
        <div className="flex items-center gap-1.5">
          <Sparkles className="size-3 text-amber-500" />
          <span>{t("menus_label")}</span>
        </div>
        {isSearching ? (
          <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400 font-medium text-[10px]">
            <Loader2 className="size-3 animate-spin" /> {t("results_loading")}
          </span>
        ) : (
          <span className="text-[10px] text-muted-foreground/60">{t("items_count", { count: results.length })}</span>
        )}
      </div>

      <CommandList className={cn("max-h-80 overflow-y-auto p-1.5 space-y-2 overscroll-contain no-scrollbar", listClassName)}>
        {results.length === 0 && !isSearching ? (
          <CommandEmpty className="py-8 text-center text-xs text-muted-foreground/70 font-medium flex flex-col items-center justify-center gap-2">
            <MessageSquare className="size-6 text-muted-foreground/30" />
            <p className="max-w-[220px]">
              {hasQuery
                ? `"${query}" ${t("no_result_found", { query }).toLowerCase()}`
                : t("no_modules")}
            </p>
          </CommandEmpty>
        ) : null}

        {groupedResults.map((group) => (
          <CommandGroup
            key={group.category}
            heading={resolveCategoryLabel(group.category, tCat).toUpperCase()}
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
                      {isTr ? item.titleTr || item.title : item.title}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0 ml-2">
                  {item.isExactMatch ? (
                    <Badge variant="outline" className="border-emerald-500/20 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 text-[9px] px-1.5 py-0.5 font-medium rounded-md">
                      {resolveCategoryLabel(item.category, tCat)}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="border-amber-500/25 text-amber-600 dark:text-amber-400 bg-amber-500/10 text-[9px] px-1.5 py-0.5 font-medium rounded-md flex items-center gap-1">
                      <Sparkles className="size-2.5" /> {t("match_score", { score: item.score })}
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
            <span>{t("click_or_enter")}</span>
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
