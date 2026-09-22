"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Check, MessageSquare, Pencil, Sparkles, Trash2, X } from "lucide-react";
import { cn } from "@/utils/cn";
import type { YulaConversation } from "@/lib/stores/chats";

export interface YulaHistoryItemProps {
  session: YulaConversation;
  isActive: boolean;
  isEditing: boolean;
  editingTitle: string;
  pathLabel: string | null;
  paddingClassName?: string;
  onSelect: () => void;
  onStartRename: (e: React.MouseEvent) => void;
  onSaveRename: (e: React.FormEvent | React.MouseEvent) => void;
  onCancelRename: (e: React.MouseEvent) => void;
  onEditingTitleChange: (val: string) => void;
  onDelete: (e: React.MouseEvent) => void;
}

export function YulaHistoryItem({
  session,
  isActive,
  isEditing,
  editingTitle,
  pathLabel,
  paddingClassName = "px-2.5 py-1.5",
  onSelect,
  onStartRename,
  onSaveRename,
  onCancelRename,
  onEditingTitleChange,
  onDelete,
}: YulaHistoryItemProps) {
  const t = useTranslations("HistorySidebar");

  return (
    <div
      data-ide-action="true"
      data-slot="ide-conversation-item"
      onClick={() => {
        if (!isEditing) onSelect();
      }}
      className={cn(
        "group relative flex items-center justify-between rounded-lg text-xs transition-colors cursor-pointer border-0",
        paddingClassName,
        isActive
          ? "bg-primary/10 text-primary dark:bg-primary/15 font-medium"
          : "text-muted-foreground/80 hover:bg-muted/40 hover:text-foreground"
      )}
    >
      {isEditing ? (
        <form
          onSubmit={onSaveRename}
          className="flex flex-1 items-center gap-1 min-w-0"
        >
          <input
            type="text"
            autoFocus
            value={editingTitle}
            onChange={(e) => onEditingTitleChange(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === "Escape") onCancelRename(e as unknown as React.MouseEvent);
            }}
            className="flex-1 rounded border border-primary/40 bg-background px-1.5 py-0.5 text-xs outline-none text-foreground"
          />
          <button
            type="submit"
            onClick={onSaveRename}
            className="p-1 rounded text-primary hover:bg-muted transition-colors"
            title={t("save")}
          >
            <Check className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={onCancelRename}
            className="p-1 rounded text-muted-foreground hover:bg-muted transition-colors"
            title={t("cancel")}
          >
            <X className="size-3.5" />
          </button>
        </form>
      ) : (
        <>
          <div className="flex items-center gap-2 truncate min-w-0 flex-1">
            {isActive ? (
              <Sparkles className="size-3.5 shrink-0 text-primary/80" />
            ) : (
              <MessageSquare className="size-3.5 shrink-0 text-muted-foreground/50 group-hover:text-muted-foreground" />
            )}
            <span className="truncate text-[11.5px] leading-tight font-normal flex-1">
              {session.title}
            </span>
            {pathLabel ? (
              <span
                className="shrink-0 rounded bg-muted/60 px-1.5 py-0.5 text-[9.5px] font-medium text-muted-foreground/70"
                title={session.pathname}
              >
                {pathLabel}
              </span>
            ) : null}
          </div>

          <div className="flex items-center gap-0.5 ml-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
            <button
              type="button"
              onClick={onStartRename}
              className="rounded p-1 text-muted-foreground/70 hover:bg-background/80 hover:text-foreground transition-colors"
              title={t("rename")}
            >
              <Pencil className="size-3" />
            </button>
            <button
              type="button"
              onClick={onDelete}
              className="rounded p-1 text-muted-foreground/70 hover:bg-background/80 hover:text-destructive transition-colors"
              title={t("delete_conv")}
            >
              <Trash2 className="size-3" />
            </button>
          </div>
        </>
      )}
    </div>
  );
}
