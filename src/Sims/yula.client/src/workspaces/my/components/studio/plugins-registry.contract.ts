import { z } from "zod";
import { defineScreenContract } from "@/lib/contracts/screen-contract";

export const PluginsRegistryReadOutputSchema = z.object({
  success: z.boolean(),
  pluginsCount: z.number(),
  plugins: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      description: z.string(),
      version: z.string(),
      tools: z.array(z.string()),
    }),
  ),
});

export const PluginsRegistryContract = defineScreenContract({
  screenId: "entity_form:plugin_registry",
  screenTitle: "Kurumsal Eklentiler & Modüller",
  workspace: "my",
  category: "interactive_operator",
  aiEnabled: true,
  actions: {
    READ: {
      description: "Reads the list of registered corporate plugins and their tools.",
      inputSchema: z.object({}).optional(),
      outputSchema: PluginsRegistryReadOutputSchema,
      whenToCall: "When inspecting plugins or checking tool availability.",
      whenNotToCall: "When not on plugins screen.",
    },
  },
});

export type PluginsRegistryAction = keyof typeof PluginsRegistryContract.actions;
