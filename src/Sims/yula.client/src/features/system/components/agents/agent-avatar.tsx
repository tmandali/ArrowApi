"use client";

import { cn } from "@/utils/cn";

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

type AgentAvatarProps = {
  /** Yüklenen SVG/foto (dataURL veya URL); yoksa hiçbir şey render edilmez */
  value?: string | null;
  name?: string;
  className?: string;
};

/**
 * Ajan görseli tek noktası: SVG/foto yüklüyse gösterir, yoksa görsel
 * render edilmez (yedek avatar yok).
 */
export function AgentAvatar({ value, name, className }: AgentAvatarProps) {
  if (!value || value.startsWith("icon:")) return null;
  return (
    <img
      src={value}
      alt={name ?? "Ajan"}
      className={cn("object-cover", className)}
    />
  );
}
