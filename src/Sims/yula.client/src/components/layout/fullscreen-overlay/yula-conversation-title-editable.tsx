"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Pencil } from "lucide-react";
import { useChatsStore } from "@/lib/stores/chats";
import { panelHeaderTitleClass } from "@/components/layout/panel-chrome";
import { cn } from "@/utils/cn";

export interface YulaConversationTitleEditableProps {
  className?: string;
  maxInputWidth?: string;
}

export function YulaConversationTitleEditable({
  className,
  maxInputWidth,
}: YulaConversationTitleEditableProps) {
  const t = useTranslations("AiDock");
  const activeId = useChatsStore((s) => s.activeId);
  const conversations = useChatsStore((s) => s.conversations);
  const renameConversation = useChatsStore((s) => s.renameConversation);

  const activeConv = React.useMemo(
    () => conversations.find((c) => c.id === activeId),
    [conversations, activeId],
  );

  const conversationTitle = activeConv?.title || "Yeni Sohbet";

  const [isEditing, setIsEditing] = React.useState(false);
  const [draftTitle, setDraftTitle] = React.useState("");
  const [prevActiveId, setPrevActiveId] = React.useState(activeId);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Reset editing mode when user switches conversations
  if (activeId !== prevActiveId) {
    setPrevActiveId(activeId);
    setIsEditing(false);
  }

  // Auto-focus and select text when entering editing mode
  React.useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isEditing]);

  const handleStartEditing = React.useCallback(() => {
    setDraftTitle(conversationTitle);
    setIsEditing(true);
  }, [conversationTitle]);

  const handleSave = React.useCallback(() => {
    const trimmed = draftTitle.trim();
    if (trimmed && activeId && trimmed !== conversationTitle) {
      renameConversation(activeId, trimmed);
    }
    setIsEditing(false);
  }, [draftTitle, activeId, conversationTitle, renameConversation]);

  const handleCancel = React.useCallback(() => {
    setIsEditing(false);
  }, []);

  if (isEditing) {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSave();
        }}
        className="flex items-center min-w-0"
      >
        <input
          ref={inputRef}
          type="text"
          data-ide-action="true"
          value={draftTitle}
          onChange={(e) => setDraftTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleSave();
            } else if (e.key === "Escape") {
              e.preventDefault();
              handleCancel();
            }
          }}
          onBlur={handleSave}
          className={cn(
            "h-6 rounded border border-primary/40 bg-background px-1.5 py-0.5 text-xs font-semibold text-foreground outline-none ring-1 ring-primary/30",
            maxInputWidth ?? "w-[180px] sm:w-[260px]",
          )}
        />
      </form>
    );
  }

  return (
    <button
      type="button"
      data-ide-action="true"
      onClick={handleStartEditing}
      title={t("edit_title")}
      aria-label={t("edit_title")}
      className={cn(
        panelHeaderTitleClass,
        "group flex max-w-[200px] sm:max-w-md items-center gap-1.5 rounded px-1.5 -mx-1.5 py-0.5 text-left transition-colors hover:bg-muted/60 cursor-pointer select-none",
        className,
      )}
    >
      <span className="truncate">{conversationTitle}</span>
      <Pencil className="size-2.5 opacity-0 group-hover:opacity-60 transition-opacity shrink-0 text-muted-foreground" />
    </button>
  );
}
