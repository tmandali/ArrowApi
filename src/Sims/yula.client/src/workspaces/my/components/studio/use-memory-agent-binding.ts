"use client";

import { useAgentComponent } from "@my-agent/react";
import { agentMemory, type MemoryEntry, type ActionContract } from "@my-agent/core";
import { z } from "zod";

export interface UseMemoryAgentBindingOptions {
  entries: MemoryEntry[];
  reload: () => void;
  screenTitle?: string;
}

export const MEMORY_READ_CONTRACT = {
  description: "Reads user preferences and facts stored in persistent memory.",
  inputSchema: z.object({}).optional(),
  outputSchema: z.object({
    success: z.boolean(),
    factsCount: z.number(),
    facts: z.array(
      z.object({
        key: z.string(),
        value: z.any(),
        scope: z.string().optional(),
        description: z.string().optional(),
      }),
    ),
  }),
  whenToCall: "When inspecting what Yula remembers about user habits or preferences.",
  whenNotToCall: "When not on memory screen.",
} satisfies ActionContract;

export const MEMORY_FORGET_CONTRACT = {
  description: "Removes a specific memory fact by key ({ key: string }).",
  inputSchema: z.object({
    key: z.string(),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    message: z.string().optional(),
  }),
  whenToCall: "When the user asks to forget or remove a specific stored preference.",
  whenNotToCall: "When inspecting memory.",
} satisfies ActionContract;

export const MEMORY_CLEAR_ALL_CONTRACT = {
  description: "Clears all remembered facts from persistent memory.",
  inputSchema: z.object({}).optional(),
  outputSchema: z.object({
    success: z.boolean(),
    message: z.string().optional(),
  }),
  whenToCall: "When the user explicitly asks to clear or reset all memory.",
  whenNotToCall: "When deleting a single item.",
} satisfies ActionContract;

/**
 * Headless UI-Agent binding hook for Persistent Memory (`id: "entity_form:agent_memory"`).
 */
export function useMemoryAgentBinding({
  entries,
  reload,
  screenTitle = "Kalıcı Bellek & Tercihler",
}: UseMemoryAgentBindingOptions) {
  useAgentComponent({
    id: "entity_form:agent_memory",
    meta: {
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
    actions: {
      READ: MEMORY_READ_CONTRACT,
      FORGET: MEMORY_FORGET_CONTRACT,
      CLEAR_ALL: MEMORY_CLEAR_ALL_CONTRACT,
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
        agentMemory.forget(payload.key);
        reload();
        return { success: true, message: `Forgot '${payload.key}'` };
      },
      CLEAR_ALL: async () => {
        agentMemory.clear("all");
        reload();
        return { success: true, message: "Cleared all persistent memory facts." };
      },
    },
  });
}
