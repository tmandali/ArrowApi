"use client";

import { useAgentComponent } from "@my-agent/react";
import type { ActionContract } from "@my-agent/core";
import { z } from "zod";
import type { SettingsTabId } from "./settings-types";
import type { useSettingsFormState } from "./use-settings-form-state";

export function isSettingsTab(v: string | null): v is SettingsTabId {
  return (
    v === "user-details" ||
    v === "settings" ||
    v === "yula-ai" ||
    v === "connections"
  );
}

export interface UseMySettingsAgentOptions {
  activeTab: SettingsTabId;
  screenTitle: string;
  form: ReturnType<typeof useSettingsFormState>;
  handleTabChange: (tab: SettingsTabId) => void;
}

export const SETTINGS_READ_CONTRACT = {
  description: "Reads current user profile, preferences, and AI configuration.",
  inputSchema: z.object({}).optional(),
  outputSchema: z.object({
    success: z.boolean(),
    activeTab: z.string(),
    profile: z.record(z.string(), z.any()),
    aiSettings: z.record(z.string(), z.any()),
  }),
  whenToCall: "When inspecting user settings, AI provider, or profile parameters.",
  whenNotToCall: "When modifying values.",
} satisfies ActionContract;

export const SETTINGS_SWITCH_TAB_CONTRACT = {
  description:
    "Switches the active settings tab ({ tab: 'user-details' | 'settings' | 'yula-ai' | 'connections' }).",
  inputSchema: z.object({
    tab: z.enum(["user-details", "settings", "yula-ai", "connections"]),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    activeTab: z.string().optional(),
    error: z.string().optional(),
  }),
  whenToCall: "When the user asks to open profile, preferences, or AI model settings.",
  whenNotToCall: "When the tab is already active.",
} satisfies ActionContract;

export const SETTINGS_SET_AI_CONFIG_CONTRACT = {
  description:
    "Updates AI provider, model, or thinking parameters ({ provider?: string, model?: string, thinkingLevel?: string }).",
  inputSchema: z.object({
    provider: z.string().optional(),
    model: z.string().optional(),
    thinkingLevel: z.string().optional(),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    message: z.string().optional(),
  }),
  whenToCall: "When the user asks to change the active LLM model or AI provider.",
  whenNotToCall: "When updating profile info.",
} satisfies ActionContract;

/**
 * Headless UI-Agent binding hook for user settings form (`id: "entity_form:user_settings"`).
 */
export function useMySettingsAgent({
  activeTab,
  screenTitle,
  form,
  handleTabChange,
}: UseMySettingsAgentOptions) {
  useAgentComponent({
    id: "entity_form:user_settings",
    meta: {
      entity: "user_settings",
      screenTitle,
      workspace: "my",
      activeTab,
      profile: {
        email: form.profileEmail,
        fullName:
          form.profileFullName ||
          `${form.profileFirstName} ${form.profileLastName}`.trim(),
        language: form.profileLanguage,
        timeZone: form.profileTimeZone,
      },
      aiSettings: {
        provider: form.aiProvider,
        model: form.aiModel,
        endpoint: form.aiEndpoint,
        thinkingLevel: form.aiThinkingLevel,
      },
    },
    actions: {
      READ: SETTINGS_READ_CONTRACT,
      SWITCH_TAB: SETTINGS_SWITCH_TAB_CONTRACT,
      SET_AI_CONFIG: SETTINGS_SET_AI_CONFIG_CONTRACT,
    },
    handlers: {
      READ: async () => {
        return {
          success: true,
          activeTab,
          profile: {
            email: form.profileEmail,
            fullName:
              form.profileFullName ||
              `${form.profileFirstName} ${form.profileLastName}`.trim(),
            language: form.profileLanguage,
            timeZone: form.profileTimeZone,
          },
          aiSettings: {
            provider: form.aiProvider,
            model: form.aiModel,
            endpoint: form.aiEndpoint,
            thinkingLevel: form.aiThinkingLevel,
          },
        };
      },
      SWITCH_TAB: async (payload) => {
        const targetTab = payload.tab as SettingsTabId;
        if (isSettingsTab(targetTab)) {
          handleTabChange(targetTab);
          return { success: true, activeTab: targetTab };
        }
        return { success: false, error: `Invalid tab: ${payload.tab}` };
      },
      SET_AI_CONFIG: async (payload) => {
        if (payload.provider) form.setAiProvider(payload.provider as any);
        if (payload.model) form.setAiModel(payload.model);
        if (payload.thinkingLevel) form.setAiThinkingLevel(payload.thinkingLevel as any);
        return { success: true, message: "AI configuration updated on screen." };
      },
    },
  });
}
