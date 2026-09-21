"use client";

import * as React from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  Sparkles,
  Package,
  Receipt,
  BarChart2,
  Settings,
  Scale,
  Wrench,
  Pin,
  Pencil,
  Check,
  Trash2,
  X,
  MessagesSquare,
} from "lucide-react";
import { resolveCategoryLabel } from "@/components/layout/workspace-search-hooks";
import type { WorkspaceSearchResultItem } from "@/hooks/use-workspace-rag-search";
import { useChatsStore } from "@/lib/stores/chats";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/utils/cn";

export function getCategoryIcon(category: string, isRag = false) {
  if (isRag) {
    return <Sparkles className="size-3.5 shrink-0 text-amber-500/90 group-hover:text-amber-600 dark:text-amber-400" />;
  }
  switch (category) {
    case "Sohbet Geçmişi":
      return <MessagesSquare className="size-3.5 shrink-0 text-sky-500/80 group-hover:text-sky-600 dark:text-sky-400" />;
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

export interface SearchResultRowProps {
  item: WorkspaceSearchResultItem;
  isSelected: boolean;
  activeRef?: React.Ref<HTMLDivElement>;
  query: string;
  itemIsPinned: boolean;
  isEditing: boolean;
  editingTitle: string;
  onEditingTitleChange: (value: string) => void;
  onStartRename: (e: React.MouseEvent, id: string, currentTitle: string) => void;
  onSaveRename: (e: React.FormEvent | React.MouseEvent, id: string) => void;
  onCancelEdit: () => void;
  onSelect: () => void;
  onHover: () => void;
  onTogglePin: (e: React.MouseEvent) => void;
}

export function SearchResultRow({
  item,
  isSelected,
  activeRef,
  query,
  itemIsPinned,
  isEditing,
  editingTitle,
  onEditingTitleChange,
  onStartRename,
  onSaveRename,
  onCancelEdit,
  onSelect,
  onHover,
  onTogglePin,
}: SearchResultRowProps) {
  const t = useTranslations("SearchMainView");
  const tCat = useTranslations("SearchCats");
  const locale = useLocale();
  const isTr = locale === "tr";
  const isEditingConv = isEditing && !!item.conversationId;

  return (
    <div
      ref={activeRef}
      onClick={() => {
        if (!isEditingConv) onSelect();
      }}
      onMouseEnter={onHover}
      className={cn(
        "group relative flex items-center justify-between rounded-lg px-3 py-2 text-xs transition-all cursor-pointer border-0",
        isSelected
          ? "bg-primary/10 text-primary font-medium dark:bg-primary/15 ring-1 ring-primary/30"
          : "text-muted-foreground/80 hover:bg-muted/40 hover:text-foreground"
      )}
    >
      {isEditingConv ? (
        <form
          onSubmit={(e) => onSaveRename(e, item.conversationId!)}
          onClick={(e) => e.stopPropagation()}
          className="flex flex-1 items-center gap-1 min-w-0"
        >
          <input
            type="text"
            autoFocus
            value={editingTitle}
            onChange={(e) => onEditingTitleChange(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === "Escape") onCancelEdit();
            }}
            className="flex-1 rounded border border-primary/40 bg-background px-2 py-0.5 text-xs outline-none text-foreground"
          />
          <button
            type="submit"
            onClick={(e) => onSaveRename(e, item.conversationId!)}
            className="p-1 rounded text-primary hover:bg-muted transition-colors"
            title={t("save")}
          >
            <Check className="size-3" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onCancelEdit();
            }}
            className="p-1 rounded text-muted-foreground hover:bg-muted transition-colors"
            title={t("cancel")}
          >
            <X className="size-3" />
          </button>
        </form>
      ) : (
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          {getCategoryIcon(item.category, !item.isExactMatch)}
          {/* Menü adı tek dillidir: aktif locale'e göre başlık seçilir (TR → titleTr, EN → title). */}
          <span className="truncate text-xs leading-tight font-normal text-foreground/90 group-hover:text-foreground">
            {isTr ? item.titleTr || item.title : item.title}
          </span>
        </div>
      )}

      <div className="flex items-center gap-1 shrink-0 ml-2">
        {item.source === "conversation" && item.conversationId ? (
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
            <button
              type="button"
              title={t("rename")}
              aria-label={t("rename")}
              onClick={(e) => onStartRename(e, item.conversationId!, item.title)}
              className="rounded p-1 text-muted-foreground/70 hover:bg-background/80 hover:text-foreground transition-colors"
            >
              <Pencil className="size-3" />
            </button>
            <button
              type="button"
              title={t("delete_conversation")}
              aria-label={t("delete_conversation")}
              onClick={(e) => {
                e.stopPropagation();
                if (item.conversationId) {
                  useChatsStore.getState().deleteConversation(item.conversationId);
                }
              }}
              className="rounded p-1 text-muted-foreground/70 hover:bg-background/80 hover:text-destructive transition-colors"
            >
              <Trash2 className="size-3" />
            </button>
          </div>
        ) : null}

        {query.trim() && item.isExactMatch ? (
          <span className="text-[10px] text-muted-foreground/50 bg-muted/30 px-2 py-0.5 rounded font-normal">
            {resolveCategoryLabel(item.category, tCat)}
          </span>
        ) : query.trim() && !item.isExactMatch ? (
          <Badge
            variant="outline"
            className="border-amber-500/25 text-amber-600 dark:text-amber-400 bg-amber-500/10 text-[9px] px-1.5 py-0.5 font-medium rounded-md flex items-center gap-1"
          >
            <Sparkles className="size-2.5" /> {t("match_score", { score: item.score })}
          </Badge>
        ) : null}

        {item.source === "conversation" ? null : (
          <button
            type="button"
            title={itemIsPinned ? t("unpin") : t("pin_home")}
            onClick={onTogglePin}
            className={cn(
              "rounded p-1 bg-transparent border-0 outline-none transition-all cursor-pointer",
              itemIsPinned
                ? "text-amber-500 opacity-100 hover:text-amber-600"
                : "opacity-0 group-hover:opacity-100 text-muted-foreground/50 hover:text-amber-500"
            )}
          >
            <Pin className={cn("size-3", itemIsPinned && "fill-amber-500/40 text-amber-500")} />
          </button>
        )}
      </div>
    </div>
  );
}
