"use client";

import { useTranslations } from "next-intl";
import { useScreenContract } from "@/hooks/use-screen-contract";
import { SystemUsersContract } from "./system-users.contract";

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

  useScreenContract(SystemUsersContract, {
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
    runtimeMeta: {
      entity: "system_users",
      screenTitle,
      workspace: "system",
      usersCount,
      guestsCount,
      tab,
      searchTerm,
    },
    handlers: {
      READ: async () => {
        return {
          success: true,
          usersCount,
          guestsCount,
          tab,
          searchTerm,
        };
      },
      SEARCH: async (payload) => {
        const query = payload?.query ?? "";
        setSearchTerm(query);
        return { success: true, searchTerm: query };
      },
      SWITCH_TAB: async (payload) => {
        const targetTab = payload?.tab as "catalog" | "guests";
        if (targetTab === "catalog" || targetTab === "guests") {
          setTab(targetTab);
          return { success: true, tab: targetTab };
        }
        return { success: false, error: "Invalid tab" };
      },
    },
  });
}
