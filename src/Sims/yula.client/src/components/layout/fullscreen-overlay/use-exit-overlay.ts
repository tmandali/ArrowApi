"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { useWorkspaceAiChat } from "@/context/workspace-ai-chat-context";
import { useChatsStore } from "@/lib/stores/chats";
import { isWorkspaceHomePath } from "@/lib/workspace-paths";
import { resolveTargetScreen } from "@/lib/yula-screen-resolver";

/**
 * Hook to handle exiting fullscreen overlay mode.
 * Transitions state to dock mode (expanded: false, open: true).
 * If currently on the home page (/), resolves the active conversation's
 * underlying screen/job and navigates directly to it.
 */
export function useExitOverlay() {
  const { setOpen, setExpanded } = useWorkspaceAiChat();
  const pathname = usePathname();
  const router = useRouter();

  return React.useCallback(() => {
    const isHome = isWorkspaceHomePath(pathname);
    if (isHome) {
      const activeId = useChatsStore.getState().activeId;
      const activeConv = useChatsStore.getState().conversations.find((c) => c.id === activeId);
      const messages = activeId ? useChatsStore.getState().messagesById[activeId] : undefined;
      const target = resolveTargetScreen(pathname, activeConv, messages);
      if (target && !isWorkspaceHomePath(target)) {
        router.push(target);
      }
    }
    setExpanded(false);
    setOpen(true);
  }, [pathname, router, setExpanded, setOpen]);
}
