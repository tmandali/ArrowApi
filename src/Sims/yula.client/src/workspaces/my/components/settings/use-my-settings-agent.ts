"use client";

import { useTranslations } from "next-intl";
import { useScreenContract } from "@/hooks/use-screen-contract";
import type { SettingsTabId } from "./settings-types";
import type { useSettingsFormState } from "./use-settings-form-state";
import { UserSettingsContract } from "./user-settings.contract";

export function isSettingsTab(v: string | null): v is SettingsTabId {
  return (
    v === "user-details" ||
    v === "settings" ||
    v === "connections"
  );
}

export interface UseMySettingsAgentOptions {
  activeTab: SettingsTabId;
  screenTitle: string;
  form: ReturnType<typeof useSettingsFormState>;
  handleTabChange: (tab: SettingsTabId) => void;
}

/**
 * Headless UI-Agent binding hook for user settings form (`id: "entity_form:user_settings"`).
 */
export function useMySettingsAgent({
  activeTab,
  screenTitle,
  form,
  handleTabChange,
}: UseMySettingsAgentOptions) {
  const t = useTranslations("MySettings");

  useScreenContract(UserSettingsContract, {
    quickPrompts: [
      t("prompt_save_settings"),
      t("prompt_change_store"),
    ],
    state: {
      activeTab,
      email: form.profileEmail,
      language: form.profileLanguage,
      timeZone: form.profileTimeZone,
      aiProvider: form.aiProvider,
      aiModel: form.aiModel,
      aiThinkingLevel: form.aiThinkingLevel,
    },
    getExitSnapshot: () => ({
      activeTab,
      email: form.profileEmail,
      aiProvider: form.aiProvider,
      aiModel: form.aiModel,
    }),
    runtimeMeta: {
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
        const targetTab = payload?.tab as SettingsTabId;
        if (isSettingsTab(targetTab)) {
          handleTabChange(targetTab);
          return { success: true, activeTab: targetTab };
        }
        return { success: false, error: `Invalid tab: ${payload?.tab}` };
      },
      SET_AI_CONFIG: async (payload) => {
        if (payload?.provider) form.setAiProvider(payload.provider as any);
        if (payload?.model) form.setAiModel(payload.model);
        if (payload?.thinkingLevel) form.setAiThinkingLevel(payload.thinkingLevel as any);
        return { success: true, message: "AI configuration updated on screen." };
      },
    },
  });
}
