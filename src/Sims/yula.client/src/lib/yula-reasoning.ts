/**
 * Efor (reasoning effort) — saf çekirdek.
 * AI SDK cookbook deseni: taşınabilir top-level `reasoning` parametresi
 * (`low` | `medium` | `high`) kullanılır; provider'a özel
 * `providerOptions.reasoningEffort` ile aynı anda yazılmaz (precedence çakışması).
 * `off` = reasoning kapalı. `undefined` = miras (Genel ayar).
 */

export type YulaEffort = "off" | "low" | "medium" | "high";

export const YULA_EFFORT_LEVELS: YulaEffort[] = ["off", "low", "medium", "high"];

export type YulaReasoningLevel = "low" | "medium" | "high";

export function normalizeEffort(value: unknown): YulaEffort | undefined {
  if (value === undefined || value === null) return undefined;
  const v = String(value).trim().toLowerCase();
  if (v === "" || v === "auto" || v === "inherit" || v === "genel") return undefined;
  if (v === "off" || v === "kapalı" || v === "none") return "off";
  if (v === "low" || v === "düşük") return "low";
  if (v === "medium" || v === "orta") return "medium";
  if (v === "high" || v === "yüksek") return "high";
  return undefined;
}

/** Eski boolean thinking bayrağını efor'a çevirir (geriye uyumluluk). */
export function thinkingToEffort(thinking: boolean | undefined): YulaEffort | undefined {
  if (thinking === false) return "off";
  return undefined;
}

/** Çözüm önceliği: ajan pini > istek > global > varsayılan (low). */
export function resolveEffort(sources: {
  agentEffort?: YulaEffort | null;
  requestEffort?: YulaEffort | null;
  globalEffort?: YulaEffort | null;
  defaultEffort?: YulaEffort;
}): YulaEffort {
  const pick = (v: YulaEffort | null | undefined): YulaEffort | undefined =>
    v === null || v === undefined || (typeof v === "string" && v.trim() === "")
      ? undefined
      : normalizeEffort(v) ?? undefined;
  return (
    pick(sources.agentEffort) ??
    pick(sources.requestEffort) ??
    pick(sources.globalEffort) ??
    sources.defaultEffort ??
    "low"
  );
}

/** Efor → AI SDK top-level `reasoning`. `off`/`undefined` => parametre yazılmaz. */
export function effortToReasoning(
  effort: YulaEffort | undefined | null,
): YulaReasoningLevel | undefined {
  const n = normalizeEffort(effort ?? "");
  if (!n || n === "off") return undefined;
  return n;
}

/**
 * Efor → Ollama `think` alanı.
 * gpt-oss modelleri boolean değil seviye stringi ister (low/medium/high);
 * diğer thinking modelleri boolean alır. `off` => false.
 */
export function effortToOllamaThink(effort: YulaEffort | undefined | null, modelName?: string): boolean | string {
  const n = normalizeEffort(effort ?? "");
  if (!n || n === "off") return false;
  const lower = (modelName ?? "").toLowerCase();
  if (lower.includes("gpt-oss")) return n;
  return true;
}

/** Model capability efor destekliyor mu? (hasThinking reuse — ayrı alan açılmaz.) */
export function supportsEffort(capability?: {
  capabilities?: { hasThinking?: boolean };
  hasThinking?: boolean;
} | null): boolean {
  if (!capability) return false;
  return Boolean(capability.capabilities?.hasThinking ?? capability.hasThinking);
}

export const YULA_EFFORT_LABELS: Record<YulaEffort, string> = {
  off: "Kapalı",
  low: "Düşük",
  medium: "Orta",
  high: "Yüksek",
};
