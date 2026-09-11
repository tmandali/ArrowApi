/**
 * Yapılandırılmış öneri çipleri (suggest_next_steps) — saf çekirdek.
 * Tool girdisini/çıktısını savunmacı şekilde öneri listesine indirger
 * (en fazla 10). Bileşen `components/layout/yula-suggestion-chips.tsx`.
 */

export type YulaSuggestionKind = "finding" | "report" | "navigation" | "analysis";

export interface YulaSuggestion {
  kind: YulaSuggestionKind;
  title: string;
  prompt?: string;
  scope?: string;
  path?: string;
}

const VALID_KINDS: ReadonlySet<string> = new Set([
  "finding",
  "report",
  "navigation",
  "analysis",
]);

/** En fazla 10 öneri kuralı (keşif/örnekleme sınırı). */
export const YULA_SUGGESTION_MAX = 10;

/** Tool girdisini/çıktısını savunmacı şekilde öneri listesine indirger. */
export function asSuggestions(value: unknown): YulaSuggestion[] {
  const raw =
    value && typeof value === "object"
      ? (value as { suggestions?: unknown }).suggestions
      : undefined;
  if (!Array.isArray(raw)) return [];
  const out: YulaSuggestion[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const kind = String(rec.kind ?? "");
    const title = typeof rec.title === "string" ? rec.title.trim() : "";
    if (!VALID_KINDS.has(kind) || !title) continue;
    const prompt =
      typeof rec.prompt === "string" && rec.prompt.trim() ? rec.prompt : undefined;
    const scope =
      typeof rec.scope === "string" && rec.scope.trim() ? rec.scope : undefined;
    const path =
      typeof rec.path === "string" && rec.path.trim() ? rec.path : undefined;
    out.push({
      kind: kind as YulaSuggestionKind,
      title: title.slice(0, 80),
      prompt,
      scope,
      path,
    });
    if (out.length >= YULA_SUGGESTION_MAX) break;
  }
  return out;
}
