"use client";

import * as React from "react";
import Link from "next/link";
import {
  PinOff,
  Package,
  Receipt,
  BarChart2,
  Settings,
  Scale,
  Wrench,
} from "lucide-react";
import { usePinnedWorkspaceItems } from "@/hooks/use-pinned-workspace-items";
import { useWorkspaceSearchMeta } from "@/components/layout/workspace-search-hooks";
import { cn } from "@/utils/cn";

function getCategoryIcon(category: string) {
  switch (category) {
    case "Katalog":
      return <Package className="size-4 shrink-0 text-primary" />;
    case "İşlemler":
      return <Receipt className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />;
    case "Raporlar":
      return <BarChart2 className="size-4 shrink-0 text-blue-600 dark:text-blue-400" />;
    case "Ayarlar":
      return <Settings className="size-4 shrink-0 text-gray-500" />;
    case "Seri & Parti":
      return <Scale className="size-4 shrink-0 text-purple-600 dark:text-purple-400" />;
    case "Araçlar":
      return <Wrench className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />;
    default:
      return <Package className="size-4 shrink-0 text-primary" />;
  }
}

interface WorkspacePinnedItemsGridProps {
  workspace?: string;
  className?: string;
}

export function WorkspacePinnedItemsGrid({
  workspace: propWorkspace,
  className,
}: WorkspacePinnedItemsGridProps) {
  const { workspace: metaWorkspace } = useWorkspaceSearchMeta();
  const workspace = propWorkspace || metaWorkspace;
  const { pinnedItems, unpinItem } = usePinnedWorkspaceItems(workspace);

  if (pinnedItems.length === 0) {
    return null;
  }

  return (
    <div className={cn("w-full max-w-3xl px-3 pt-2 animate-in fade-in-50 duration-200", className)}>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
        {pinnedItems.map((item) => (
          <div
            key={item.id}
            className="group relative flex items-center justify-between rounded-xl border border-border/60 bg-background/60 hover:bg-accent/40 p-2.5 transition-all duration-200 hover:border-primary/40 hover:shadow-sm"
          >
            <Link
              href={item.url}
              className="flex items-center gap-2.5 min-w-0 flex-1 pr-2"
            >
              <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted/60 group-hover:bg-primary/10 transition-colors">
                {getCategoryIcon(item.category)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1">
                  <h3 className="text-[12px] font-medium tracking-tight text-foreground truncate group-hover:text-primary transition-colors">
                    {item.title}
                  </h3>
                </div>
                {item.titleTr && item.titleTr !== item.title ? (
                  <p className="text-[10px] text-muted-foreground/70 truncate leading-tight">
                    {item.titleTr}
                  </p>
                ) : (
                  <p className="text-[10px] text-muted-foreground/60 truncate leading-tight">
                    {item.category}
                  </p>
                )}
              </div>
            </Link>

            <div className="flex items-center shrink-0">
              <button
                type="button"
                title="İğneyi Kaldır"
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  unpinItem(item.id);
                }}
                className="flex size-6 items-center justify-center bg-transparent border-0 outline-none text-amber-500/80 hover:text-red-500 transition-opacity duration-150 opacity-0 group-hover:opacity-100 cursor-pointer"
              >
                <PinOff className="size-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
