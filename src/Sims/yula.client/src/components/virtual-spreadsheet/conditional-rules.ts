"use client";

/**
 * Eşik tabanlı koşullu renk kuralları (Airtable "conditional color" benzeri).
 *
 * Kolon menüsünden tanımlanır; hücre render'ında sayısal değer ilk eşleşen
 * kuralın rengiyle boyanır. Kurallar veri değil GÖRÜNÜM konfigürasyonudur →
 * performans etkisi yalnızca görünür satırlarda O(kural sayısı) karşılaştırmadır.
 */

export type ConditionalRuleOperator = ">" | ">=" | "<" | "<=" | "=";
export type ConditionalRuleColor = "red" | "green" | "amber" | "blue";

export interface ConditionalColorRule {
  id: string;
  op: ConditionalRuleOperator;
  value: number;
  color: ConditionalRuleColor;
}

/** Kolon adı → o kolon için kural listesi. */
export type ColumnColorRules = Record<string, ConditionalColorRule[]>;

export const RULE_OPERATORS: ConditionalRuleOperator[] = [">", ">=", "<", "<=", "="];
export const RULE_COLORS: ConditionalRuleColor[] = ["red", "green", "amber", "blue"];

/** Renk → (metin rengi, hafif arka plan) light/dark uyumlu Tailwind sınıfları. */
const RULE_STYLES: Record<
  ConditionalRuleColor,
  { text: string; bg: string; swatch: string }
> = {
  red: {
    text: "text-red-600 dark:text-red-400",
    bg: "bg-red-500/10",
    swatch: "bg-red-500",
  },
  green: {
    text: "text-emerald-700 dark:text-emerald-400",
    bg: "bg-emerald-500/10",
    swatch: "bg-emerald-500",
  },
  amber: {
    text: "text-amber-700 dark:text-amber-500",
    bg: "bg-amber-500/10",
    swatch: "bg-amber-500",
  },
  blue: {
    text: "text-blue-700 dark:text-blue-400",
    bg: "bg-blue-500/10",
    swatch: "bg-blue-500",
  },
};

export function ruleStyleClasses(color: ConditionalRuleColor) {
  return RULE_STYLES[color];
}

export function createColorRule(partial?: Partial<
  Omit<ConditionalColorRule, "id">
>): ConditionalColorRule {
  return {
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `cr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    op: partial?.op ?? ">",
    value: partial?.value ?? 0,
    color: partial?.color ?? "red",
  };
}

/** Hücre değerini sayıya çevirir (sayısal olmayanlar NaN → kurallar uygulanmaz). */
export function toRuleNumber(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const t = v.trim();
    return t === "" ? NaN : Number(t);
  }
  if (v != null && typeof v === "object") {
    const fo = (v as { valueOf?: unknown }).valueOf;
    if (typeof fo === "function") return Number(fo.call(v));
  }
  return NaN;
}

/** İlk eşleşen kuralın stil sınıflarını döndürür (eşleşme yoksa null). */
export function evaluateColorRules(
  rules: readonly ConditionalColorRule[] | undefined,
  rawValue: unknown
): { text: string; bg: string } | null {
  if (!rules || rules.length === 0) return null;
  const n = toRuleNumber(rawValue);
  if (!Number.isFinite(n)) return null;
  for (const r of rules) {
    let hit = false;
    switch (r.op) {
      case ">":
        hit = n > r.value;
        break;
      case ">=":
        hit = n >= r.value;
        break;
      case "<":
        hit = n < r.value;
        break;
      case "<=":
        hit = n <= r.value;
        break;
      case "=":
        hit = n === r.value;
        break;
    }
    if (hit) return RULE_STYLES[r.color];
  }
  return null;
}
