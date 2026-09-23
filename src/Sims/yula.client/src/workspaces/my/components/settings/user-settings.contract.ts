import { z } from "zod";
import { defineScreenContract } from "@/lib/contracts/screen-contract";

export const SettingsSwitchTabInputSchema = z.object({
  tab: z.enum(["user-details", "settings", "connections"]),
});

export const SettingsSetAiConfigInputSchema = z.object({
  provider: z.string().optional(),
  model: z.string().optional(),
  thinkingLevel: z.string().optional(),
});

export const UserSettingsContract = defineScreenContract({
  screenId: "entity_form:user_settings",
  screenTitle: "Profil & Tercihler",
  workspace: "my",
  category: "interactive_operator",
  aiEnabled: true,
  actions: {
    READ: {
      description: "Reads current user profile, preferences, and AI configuration.",
      inputSchema: z.object({}).optional(),
      whenToCall: "When inspecting user settings, AI provider, or profile parameters.",
      whenNotToCall: "When modifying values.",
    },
    SWITCH_TAB: {
      description:
        "Switches the active settings tab ({ tab: 'user-details' | 'settings' | 'connections' }).",
      inputSchema: SettingsSwitchTabInputSchema,
      whenToCall: "When the user asks to open profile or preferences settings.",
      whenNotToCall: "When the tab is already active.",
    },
    SET_AI_CONFIG: {
      description:
        "Updates AI provider, model, or thinking parameters ({ provider?: string, model?: string, thinkingLevel?: string }).",
      inputSchema: SettingsSetAiConfigInputSchema,
      whenToCall: "When the user asks to change the active LLM model or AI provider.",
      whenNotToCall: "When updating profile info.",
    },
  },
});

export type UserSettingsAction = keyof typeof UserSettingsContract.actions;
