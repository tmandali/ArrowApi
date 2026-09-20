"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Eye, Maximize2, Minimize2, SquarePen, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWorkspaceAiChat } from "@/context/workspace-ai-chat-context";
import { useOptionalYulaChat } from "@/hooks/use-yula-chat";
import { useChatsStore } from "@/lib/stores/chats";
import { uiEventBus } from "@my-agent/core";
import { cn } from "@/utils/cn";

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

export function YulaFocusScreenButton({
  screenTitle,
  pathname,
  className,
}: {
  screenTitle: string;
  pathname: string;
  className?: string;
}) {
  const t = useTranslations("AiDock");
  const { setExpanded } = useWorkspaceAiChat();

  const handleFocus = () => {
    uiEventBus.recordTelemetry({
      source: "yula_dock",
      type: "USER_FOCUS_SCREEN",
      payload: { pathname, screen: screenTitle },
    });
    setExpanded(false);
  };

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className={cn(
        "h-7 gap-1.5 px-2 text-xs font-medium text-muted-foreground hover:text-foreground border-border/80 hover:bg-muted/80 shrink-0",
        className,
      )}
      onClick={handleFocus}
      title={t("focus_screen_tooltip", { screen: screenTitle })}
      aria-label={t("focus_screen_tooltip", { screen: screenTitle })}
    >
      <Eye className="size-3.5 shrink-0 text-primary" />
      <span className="font-medium text-foreground">{t("focus_screen")}</span>
      <span className="hidden sm:inline-block max-w-[140px] truncate text-muted-foreground">
        ({screenTitle})
      </span>
      <Minimize2 className="size-3 shrink-0 opacity-60 ml-0.5" />
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
