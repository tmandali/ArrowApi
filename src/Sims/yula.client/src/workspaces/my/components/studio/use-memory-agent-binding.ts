"use client";

import { useTranslations } from "next-intl";
import { useScreenContract } from "@/hooks/use-screen-contract";
import { agentMemory, type MemoryEntry } from "@my-agent/core";
import { MemoryManagementContract } from "./memory-management.contract";

export interface UseMemoryAgentBindingOptions {
  entries: MemoryEntry[];
  reload: () => void;
  screenTitle?: string;
}

/**
 * Headless UI-Agent binding hook for Persistent Memory (`id: "entity_form:agent_memory"`).
 */
export function useMemoryAgentBinding({
  entries,
  reload,
  screenTitle = "Kalıcı Bellek & Tercihler",
}: UseMemoryAgentBindingOptions) {
  const t = useTranslations("Studio");

  useScreenContract(MemoryManagementContract, {
    quickPrompts: [
      t("prompt_list_memory"),
      t("prompt_clear_memory"),
    ],
    state: {
      factsCount: entries.length,
      keys: entries.map((e) => e.key),
    },
    getExitSnapshot: () => ({
      factsCount: entries.length,
    }),
    runtimeMeta: {
      entity: "agent_memory",
      screenTitle,
      workspace: "my",
      factsCount: entries.length,
      facts: entries.map((e) => ({
        key: e.key,
        value: e.value,
        scope: e.scope,
        description: e.description || e.key,
      })),
    },
    handlers: {
      READ: async () => {
        return {
          success: true,
          factsCount: entries.length,
          facts: entries.map((e) => ({
            key: e.key,
            value: e.value,
            scope: e.scope,
            description: e.description || e.key,
          })),
        };
      },
      FORGET: async (payload) => {
        const key = payload?.key;
        if (key) {
          agentMemory.forget(key);
          reload();
          return { success: true, message: `Forgot '${key}'` };
        }
        return { success: false, message: "Missing key" };
      },
      CLEAR_ALL: async () => {
        agentMemory.clear("all");
        reload();
        return { success: true, message: "Cleared all persistent memory facts." };
      },
    },
  });
}
