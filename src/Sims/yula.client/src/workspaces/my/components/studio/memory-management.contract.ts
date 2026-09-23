import { z } from "zod";
import { defineScreenContract } from "@/lib/contracts/screen-contract";

export const MemoryReadOutputSchema = z.object({
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
});

export const MemoryForgetInputSchema = z.object({
  key: z.string(),
});

export const MemoryActionSuccessOutputSchema = z.object({
  success: z.boolean(),
  message: z.string().optional(),
});

export const MemoryManagementContract = defineScreenContract({
  screenId: "entity_form:agent_memory",
  screenTitle: "Kalıcı Bellek & Tercihler",
  workspace: "my",
  category: "interactive_operator",
  aiEnabled: true,
  actions: {
    READ: {
      description: "Reads user preferences and facts stored in persistent memory.",
      inputSchema: z.object({}).optional(),
      outputSchema: MemoryReadOutputSchema,
      whenToCall: "When inspecting what Yula remembers about user habits or preferences.",
      whenNotToCall: "When not on memory screen.",
    },
    FORGET: {
      description: "Removes a specific memory fact by key ({ key: string }).",
      inputSchema: MemoryForgetInputSchema,
      outputSchema: MemoryActionSuccessOutputSchema,
      whenToCall: "When the user asks to forget or remove a specific stored preference.",
      whenNotToCall: "When inspecting memory.",
    },
    CLEAR_ALL: {
      description: "Clears all remembered facts from persistent memory.",
      inputSchema: z.object({}).optional(),
      outputSchema: MemoryActionSuccessOutputSchema,
      whenToCall: "When the user explicitly asks to clear or reset all memory.",
      whenNotToCall: "When deleting a single item.",
    },
  },
});

export type MemoryManagementAction = keyof typeof MemoryManagementContract.actions;
