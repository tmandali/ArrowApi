"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useChatsStore } from "@/lib/stores/chats";
import { useYulaDockStore } from "@/lib/stores/dock";
import { useYulaChat } from "@/hooks/use-yula-chat";
import type { NavigationAction } from "./yula-chat-turn-helpers";

export interface YulaAssistantActionsProps {
  navAction?: NavigationAction | null;
}

/**
 * Asistan mesajı hover aksiyon çubuğu.
 * Sadece navigateTo hedefi varsa tek tıkla git butonu sunar.
 */
export function YulaAssistantActions({
  navAction,
}: YulaAssistantActionsProps) {
  const t = useTranslations("ChatTurn");
  const router = useRouter();
  const yula = useYulaChat();

  const handleNavigate = React.useCallback(() => {
    if (!navAction?.navigateTo) return;
    useChatsStore.getState().beginConversationFollow(yula.activeId);
    useYulaDockStore.getState().setExpanded(false);
    useYulaDockStore.getState().setOpen(true);
    void router.push(navAction.navigateTo);
  }, [navAction, router, yula.activeId]);

  if (!navAction?.navigateTo) return null;

  return (
    <div className="mt-1.5 flex items-center gap-1.5 transition-opacity duration-150 opacity-90 md:opacity-0 md:group-hover/assistant:opacity-100 md:group-focus-within/assistant:opacity-100 select-none">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-6.5 px-2.5 text-[11.5px] gap-1.5 text-primary hover:text-primary-foreground hover:bg-primary/90 border-primary/30 rounded-md font-medium shadow-2xs cursor-pointer select-none"
        onClick={handleNavigate}
        title={navAction.title ? `${t("open_target")}: ${navAction.title}` : t("open_target")}
      >
        <ExternalLink className="size-3 shrink-0" />
        <span className="truncate max-w-[260px]">
          {navAction.title || t("open_target")}
        </span>
      </Button>
    </div>
  );
}
