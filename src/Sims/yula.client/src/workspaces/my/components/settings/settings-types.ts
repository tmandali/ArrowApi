export interface AiProviderConfig {
  provider: "ollama" | "azure" | "google" | "openai" | "agnes";
  model: string;
  endpoint?: string;
  apiKey?: string;
  thinkingLevel?: "off" | "low" | "medium" | "high";
}

export const CONFIG_STORAGE_KEY = "yula_ai_config";

/** Sunucu + ilk istemci render'ında birebir aynı başlangıç (hydration güvenli). */
export const DEFAULT_AI_CONFIG: AiProviderConfig = {
  provider: "azure",
  model: "gpt-5.4",
  endpoint: "",
  apiKey: "",
  thinkingLevel: "low",
};

export const AI_PROVIDERS: AiProviderConfig["provider"][] = [
  "ollama",
  "azure",
  "google",
  "openai",
  "agnes",
];

export type SettingsApiRow = {
  email?: string | null;
  fullName?: string | null;
  language?: string | null;
  timeZone?: string | null;
  aiProvider?: string | null;
  aiModel?: string | null;
  aiEndpoint?: string | null;
  thinkingLevel?: string | null;
  systemFacts?: Record<string, string> | null;
  /** GET yanıtı tüm satırı spread eder → zaman damgaları da gelir. */
  updatedAt?: string | null;
};

export type ProfileLanguage = "english" | "turkish";
export type ProfileTimeZone = "asia-kolkata" | "europe-istanbul";

export type SettingsTabId = "user-details" | "settings" | "yula-ai" | "connections";

export type SettingsMeta = {
  identityCreatedAt: string | null;
  settingsUpdatedAt: string | null;
} | null;
