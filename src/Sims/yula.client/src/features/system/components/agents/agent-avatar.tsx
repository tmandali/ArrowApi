"use client";

import { cn } from "@/utils/cn";

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
