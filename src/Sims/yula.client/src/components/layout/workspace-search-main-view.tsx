"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Sparkles,
  Package,
  Receipt,
  BarChart2,
  Settings,
  Scale,
  Wrench,
  Loader2,
  Pin,
  X,
} from "lucide-react";
import { useWorkspaceSearch } from "@/context/workspace-search-context";
import { useWorkspaceSearchMeta } from "@/components/layout/workspace-search-hooks";
import { useWorkspaceRagSearch } from "@/hooks/use-workspace-rag-search";
import { usePinnedWorkspaceItems } from "@/hooks/use-pinned-workspace-items";
import { WORKSPACE_SEARCH_CONFIGS } from "@/features/stock/lib/stock-menu-registry";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/utils/cn";

function getCategoryIcon(category: string, isRag = false) {
  if (isRag) {
    return <Sparkles className="size-3.5 shrink-0 text-amber-500/90 group-hover:text-amber-600 dark:text-amber-400" />;
  }
  switch (category) {
    case "Katalog":
      return <Package className="size-3.5 shrink-0 text-muted-foreground/50 group-hover:text-foreground transition-colors" />;
    case "İşlemler":
      return <Receipt className="size-3.5 shrink-0 text-muted-foreground/50 group-hover:text-foreground transition-colors" />;
    case "Raporlar":
      return <BarChart2 className="size-3.5 shrink-0 text-muted-foreground/50 group-hover:text-foreground transition-colors" />;
    case "Ayarlar":
      return <Settings className="size-3.5 shrink-0 text-muted-foreground/50 group-hover:text-foreground transition-colors" />;
    case "Seri & Parti":
      return <Scale className="size-3.5 shrink-0 text-muted-foreground/50 group-hover:text-foreground transition-colors" />;
    case "Araçlar":
      return <Wrench className="size-3.5 shrink-0 text-muted-foreground/50 group-hover:text-foreground transition-colors" />;
    default:
      return <Package className="size-3.5 shrink-0 text-muted-foreground/50 group-hover:text-foreground transition-colors" />;
  }
}

export function WorkspaceSearchMainView({ className }: { className?: string }) {
  const router = useRouter();
  const { setOpen, query, setQuery } = useWorkspaceSearch();
  const { workspace } = useWorkspaceSearchMeta();
  const { groupedResults, isSearching } = useWorkspaceRagSearch(query, workspace);
  const { isPinned, togglePin } = usePinnedWorkspaceItems(workspace);
  const config = WORKSPACE_SEARCH_CONFIGS[workspace] || WORKSPACE_SEARCH_CONFIGS.stock;

  const flatItems = React.useMemo(() => {
    return groupedResults.flatMap((g) => g.items);
  }, [groupedResults]);

  const [selectedIndex, setSelectedIndex] = React.useState(0);
  const activeItemRef = React.useRef<HTMLDivElement>(null);

  // Arama sonuçları geliştikçe seçili indeksi başa sıfırla
  React.useEffect(() => {
    setSelectedIndex(0);
  }, [flatItems]);

  // Seçili öğeyi ekranda görünür tut
  React.useEffect(() => {
    activeItemRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedIndex]);

  const handleSelect = (url: string) => {
    setOpen(false);
    setQuery("");
    if (url && url !== "#") {
      router.push(url);
    }
  };

  // Klavye yön tuşları (Yukarı, Aşağı), Enter ve Escape dinleyicisi
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        setQuery("");
        return;
      }

      if (flatItems.length === 0) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev < flatItems.length - 1 ? prev + 1 : 0));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : flatItems.length - 1));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const selected = flatItems[selectedIndex];
        if (selected) {
          handleSelect(selected.url);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [flatItems, selectedIndex]);

  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-background/50 p-3 md:p-5 select-none animate-in fade-in-50 duration-150",
        className
      )}
    >
      <div className="mx-auto flex h-full min-h-0 w-full max-w-2xl flex-col">
        {/* Results Header Bar */}
        <div className="flex items-center justify-between px-2 pb-2 text-xs border-b border-border/40 mb-2 shrink-0">
          <span className="font-medium text-foreground/80 text-[11.5px] flex items-center gap-1.5">
            <Sparkles className="size-3.5 text-amber-500" />
            {query.trim() ? (
              <span>"{query}" Sonuçları ({flatItems.length})</span>
            ) : (
              <span>Tüm Modüller ({flatItems.length})</span>
            )}
          </span>

          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setQuery("");
            }}
            className="flex items-center gap-1.5 text-[11px] text-muted-foreground/70 hover:text-foreground transition-colors cursor-pointer bg-transparent border-0 outline-none"
            title="Aramayı Kapat (ESC)"
          >
            <X className="size-3.5 text-muted-foreground/70 group-hover:text-foreground" />
            <kbd className="font-mono text-[9px] text-muted-foreground/70 bg-muted/60 px-1 py-0.5 rounded border-0 font-medium">
              ESC
            </kbd>
          </button>
        </div>

        {/* Results Body Area */}
        <div className="flex-1 overflow-y-auto min-h-0 p-1 space-y-3 overscroll-contain no-scrollbar">
          {isSearching ? (
            <div className="py-12 text-center text-xs text-muted-foreground/70 font-medium flex flex-col items-center justify-center gap-2">
              <Loader2 className="size-6 animate-spin text-amber-500/90" />
              <p>Sonuçlar getiriliyor...</p>
            </div>
          ) : groupedResults.length === 0 ? (
            <div className="py-12 text-center text-xs text-muted-foreground/80 font-medium flex flex-col items-center justify-center gap-2.5">
              <Sparkles className="size-8 text-primary/40" />
              {query.trim() ? (
                <p className="max-w-[340px] leading-relaxed text-[12.5px] text-foreground/80 text-center">
                  <span className="font-semibold text-foreground">"{query}"</span> için uygun bir modül bulunamadı.
                </p>
              ) : null}
              <p className="max-w-[360px] text-[11.5px] text-muted-foreground/75 leading-relaxed text-center">
                {config.nameTr} alanında arama yapmak için modül adını veya tam hatırlamıyorsanız yapmak istediğiniz işin tarifini (ör:{" "}
                {config.examples.map((ex, i) => (
                  <React.Fragment key={ex}>
                    {i > 0 ? ", " : ""}
                    <span className="text-primary font-medium">"{ex}"</span>
                  </React.Fragment>
                ))}) yazabilirsiniz, sizin için hemen listeleyebilirim.
              </p>
            </div>
          ) : (
            groupedResults.map((group) => (
              <div key={group.category} className="space-y-1">
                <div className="px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">
                  {group.category}
                </div>
                <div className="space-y-0.5">
                  {group.items.map((item) => {
                    const itemIndex = flatItems.findIndex((f) => f.id === item.id);
                    const isSelected = itemIndex === selectedIndex;
                    const itemIsPinned = isPinned(item.id);

                    return (
                      <div
                        key={item.id}
                        ref={isSelected ? activeItemRef : null}
                        onClick={() => handleSelect(item.url)}
                        onMouseEnter={() => setSelectedIndex(itemIndex)}
                        className={cn(
                          "group relative flex items-center justify-between rounded-lg px-2.5 py-2 text-xs transition-all cursor-pointer border-0",
                          isSelected
                            ? "bg-primary/10 text-primary font-medium dark:bg-primary/15 ring-1 ring-primary/30"
                            : "text-muted-foreground/80 hover:bg-muted/40 hover:text-foreground"
                        )}
                      >
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          {getCategoryIcon(item.category, !item.isExactMatch)}
                          <span className="truncate text-[11.5px] leading-tight font-normal text-foreground/90 group-hover:text-foreground">
                            {item.title}
                          </span>
                          {item.titleTr && item.titleTr !== item.title ? (
                            <span className="text-[10px] text-muted-foreground/50 truncate font-normal">
                              [{item.titleTr}]
                            </span>
                          ) : null}
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0 ml-2">
                          {item.isExactMatch ? (
                            <span className="text-[10px] text-muted-foreground/50 bg-muted/30 px-2 py-0.5 rounded font-normal">
                              {item.category}
                            </span>
                          ) : (
                            <Badge
                              variant="outline"
                              className="border-amber-500/25 text-amber-600 dark:text-amber-400 bg-amber-500/10 text-[9px] px-1.5 py-0.5 font-medium rounded-md flex items-center gap-1"
                            >
                              <Sparkles className="size-2.5" /> %{item.score} Eşleşme
                            </Badge>
                          )}

                          <button
                            type="button"
                            title={itemIsPinned ? "İğneyi Kaldır" : "Ana Ekrana İğnele"}
                            onClick={(e) => {
                              e.stopPropagation();
                              togglePin({
                                id: item.id,
                                title: item.title,
                                titleTr: item.titleTr,
                                url: item.url,
                                category: item.category,
                                workspace: item.workspace,
                              });
                            }}
                            className={cn(
                              "flex size-6 items-center justify-center bg-transparent border-0 outline-none transition-all cursor-pointer",
                              itemIsPinned
                                ? "text-amber-500 opacity-100 hover:text-amber-600"
                                : "opacity-0 group-hover:opacity-100 text-muted-foreground/50 hover:text-amber-500"
                            )}
                          >
                            <Pin className={cn("size-3.5", itemIsPinned && "fill-amber-500/40 text-amber-500")} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
