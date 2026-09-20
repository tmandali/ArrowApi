"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Maximize2, Minimize2, SquarePen, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWorkspaceAiChat } from "@/context/workspace-ai-chat-context";
import { useOptionalYulaChat } from "@/hooks/use-yula-chat";
import { useChatsStore } from "@/lib/stores/chats";
import { cn } from "@/utils/cn";

export function YulaDeleteChatButton({ className }: { className?: string }) {
  const t = useTranslations("AiDock");
  const conversations = useChatsStore((s) => s.conversations);
  const activeId = useChatsStore((s) => s.activeId);
  const deleteConversation = useChatsStore((s) => s.deleteConversation);
  const { deleteConversation: chatDeleteConversation } =
    useOptionalYulaChat() ?? {};

  const hasSavedConversation = React.useMemo(
    () => Boolean(activeId && conversations.some((c) => c.id === activeId)),
    [activeId, conversations],
  );

  if (!hasSavedConversation || !activeId) return null;

  const handleDelete = () => {
    if (chatDeleteConversation) {
      chatDeleteConversation(activeId);
    } else {
      deleteConversation(activeId);
    }
  };

  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      data-ide-action="true"
      className={cn(
        "size-7 shrink-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10",
        className,
      )}
      onClick={handleDelete}
      title={t("delete_chat")}
      aria-label={t("delete_chat")}
    >
      <Trash2 className="size-3.5" />
    </Button>
  );
}

export function YulaNewChatButton({ className }: { className?: string }) {
  const t = useTranslations("AiDock");
  const { newConversation } = useOptionalYulaChat() ?? {};
  const setHistoryOpen = useChatsStore((s) => s.setHistoryOpen);
  const setSearchingHistory = useChatsStore((s) => s.setSearchingHistory);

  const handleNew = () => {
    setSearchingHistory(false);
    setHistoryOpen(false);
    newConversation?.();
  };

  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      data-ide-action="true"
      className={cn(
        "size-7 shrink-0 text-muted-foreground hover:text-foreground",
        className,
      )}
      onClick={handleNew}
      title={t("new_chat")}
      aria-label={t("new_chat")}
    >
      <SquarePen className="size-3.5" />
    </Button>
  );
}

export function YulaExpandToggleButton({ className }: { className?: string }) {
  const t = useTranslations("AiDock");
  const { open, setOpen, expanded, setExpanded } = useWorkspaceAiChat();

  const handleToggle = () => {
    if (!expanded) {
      if (!open) setOpen(true);
      setExpanded(true);
    } else {
      setExpanded(false);
    }
  };

  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      data-ide-action="true"
      className={cn(
        "size-7 shrink-0 text-muted-foreground hover:text-foreground",
        className,
      )}
      onClick={handleToggle}
      title={t(expanded ? "collapse_overlay" : "expand_overlay")}
      aria-label={t(expanded ? "collapse_overlay" : "expand_overlay")}
    >
      {expanded ? (
        <Minimize2 className="size-3.5" />
      ) : (
        <Maximize2 className="size-3.5" />
      )}
    </Button>
  );
}

export function YulaCloseButton({ className }: { className?: string }) {
  const t = useTranslations("AiDock");
  const { setOpen } = useWorkspaceAiChat();

  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      data-ide-action="true"
      className={cn(
        "size-7 shrink-0 text-muted-foreground hover:text-foreground",
        className,
      )}
      onClick={() => setOpen(false)}
      title={t("close_panel")}
      aria-label={t("close_panel")}
    >
      <X className="size-3.5" />
    </Button>
  );
}
