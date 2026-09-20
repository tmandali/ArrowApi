"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { useWorkspaceAiChat } from "@/context/workspace-ai-chat-context";
import { YulaFullscreenOverlay } from "@/components/layout/yula-fullscreen-overlay";

/**
 * Top-level Fullscreen Overlay Host:
 * Rendered at the AppLayout content frame level (`<main>`).
 * When Yula is in expanded fullscreen mode (`open && expanded`),
 * this host mounts YulaFullscreenOverlay so that it occupies the full content frame
 * bounded precisely between the AppHeader (top) and ModuleSidebar (left nav),
 * rather than being trapped inside individual page subtrees.
 *
 * Note: On the root path (`/`), SystemHomeView already renders the full IDE workspace directly,
 * so the overlay host is bypassed.
 */
export function YulaFullscreenHost() {
  const { open, expanded } = useWorkspaceAiChat();
  const pathname = usePathname();

  if (pathname === "/" || !open || !expanded) {
    return null;
  }

  return (
    <YulaFullscreenOverlay
      isOverlay
      className="rounded-t-2xl overflow-hidden"
    />
  );
}
