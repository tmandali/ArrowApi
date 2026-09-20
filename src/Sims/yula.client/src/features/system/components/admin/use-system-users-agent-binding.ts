"use client";

import { useTranslations } from "next-intl";
import { useScreenAgentContext } from "@/hooks/use-screen-agent-context";
import { useAgentComponent } from "@my-agent/react";

export function useSystemUsersAgentBinding({
  usersCount,
  guestsCount,
  searchTerm,
  setSearchTerm,
  tab,
  setTab,
  screenTitle,
}: {
  usersCount: number;
  guestsCount: number;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  tab: "catalog" | "guests";
  setTab: (tab: "catalog" | "guests") => void;
  screenTitle: string;
}) {
  const t = useTranslations("SystemUsers");

  useScreenAgentContext({
    screenId: "system-users",
    screenTitle,
    workspaceId: "system",
    activeDataSummary: {
      isViewingResults: false,
      jobId: undefined,
    },
    quickPrompts: [
      t("prompt_search_users"),
      t("prompt_active_count"),
      t("prompt_guest_ids"),
    ],
    stateExtra: {
      usersCount,
      guestsCount,
      tab,
      searchTerm,
    },
  });

  useAgentComponent({
    id: "entity_form:system_users",
    meta: {
      entity: "system_users",
      screenTitle,
      workspace: "system",
      usersCount,
      guestsCount,
      tab,
      searchTerm,
    },
    actions: {
      READ: {
        description: "Reads user catalog and guest identities summary.",
        whenToCall: "When inspecting users count, guest count, or active tab.",
        whenNotToCall: "When filtering users.",
      },
      SEARCH: {
        description: "Filters users or guests by search term ({ query: string }).",
        whenToCall: "When searching for a user by name or email.",
        whenNotToCall: "When clearing filter (pass query='' to reset).",
      },
      SWITCH_TAB: {
        description: "Switches between 'catalog' (registered users) and 'guests' (pending authorization).",
        whenToCall: "When user asks to see guest logins or registered users.",
        whenNotToCall: "When requested tab is already active.",
      },
    },
    onAction: async (action, payload) => {
      if (action === "READ") {
        return {
          success: true,
          usersCount,
          guestsCount,
          tab,
          searchTerm,
        };
      }
      if (action === "SEARCH" && typeof payload?.query === "string") {
        setSearchTerm(payload.query);
        return { success: true, searchTerm: payload.query };
      }
      if (action === "SWITCH_TAB" && (payload?.tab === "catalog" || payload?.tab === "guests")) {
        setTab(payload.tab);
        return { success: true, tab: payload.tab };
      }
      return { success: false, error: `Unknown action: ${action}` };
    },
  });
}
