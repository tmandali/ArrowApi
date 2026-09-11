"use client";

/** Baş harfler (user menüsüyle aynı kural: ilk 2 kelimenin baş harfi, örn. SD). */
export function agentInitials(name?: string | null): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "A";
  return parts
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}
