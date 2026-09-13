import { normalizeEffort } from "@/lib/yula-reasoning";
import {
  AI_PROVIDERS,
  type AiProviderConfig,
  type ProfileLanguage,
  type ProfileTimeZone,
} from "./settings-types";

export function normalizeApiProvider(
  value: unknown
): AiProviderConfig["provider"] | undefined {
  if (typeof value !== "string") return undefined;
  const v = value.trim().toLowerCase();
  return (AI_PROVIDERS as string[]).includes(v)
    ? (v as AiProviderConfig["provider"])
    : undefined;
}

export function normalizeThinking(
  value: unknown
): NonNullable<AiProviderConfig["thinkingLevel"]> {
  return normalizeEffort(value) ?? "low";
}

export function mapLanguageToUi(value: unknown): ProfileLanguage | undefined {
  if (typeof value !== "string") return undefined;
  const v = value.trim().toLowerCase();
  if (v === "turkish" || v === "tr" || v === "türkçe") return "turkish";
  if (v === "english" || v === "en") return "english";
  return undefined;
}

export function syncLocaleCookie(lang: ProfileLanguage): void {
  if (typeof document === "undefined") return;
  const code = lang === "turkish" ? "tr" : "en";
  document.cookie = `NEXT_LOCALE=${code}; path=/; max-age=31536000`;
}

export function mapTimeZoneToUi(value: unknown): ProfileTimeZone | undefined {
  if (typeof value !== "string") return undefined;
  const v = value.trim().toLowerCase();
  if (v === "europe/istanbul" || v === "europe-istanbul") return "europe-istanbul";
  if (v === "asia/kolkata" || v === "asia-kolkata") return "asia-kolkata";
  return undefined;
}

export function splitFullName(full: string): { first: string; last: string } {
  const parts = full.trim().split(/\s+/);
  if (parts.length <= 1) return { first: parts[0] ?? "", last: "" };
  return { first: parts[0] ?? "", last: parts.slice(1).join(" ") };
}

// Avatar baş harfleri — kullanıcı ADINDAN türetilir (hydrated kayıt geldikçe günceller).
export function profileInitialsOf(fullName: string): string {
  return (
    fullName
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

export function formatSettingsDate(
  iso: string | null | undefined,
  locale: string
): string {
  return iso
    ? new Date(iso).toLocaleDateString(locale === "tr" ? "tr-TR" : "en-US")
    : "—";
}
