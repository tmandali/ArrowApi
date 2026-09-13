"use client";

import * as React from "react";
import { useOptionalYulaChat } from "@/hooks/use-yula-chat";
import { AIChatPanelSession } from "./ai-chat-session";

export type AIChatPanelProps = {
  /** Centered Copilot-style intro until the user starts typing. */
  centeredIntro?: boolean;
  /** View mode: "main" (Ana Ekran full-width) or "dock" (Right side panel). Auto-detected if omitted. */
  mode?: "main" | "dock";
  /** Intro ekranında text box'ın altında gösterilen ek içerik (pinler / çalışma alanı kutuları). */
  belowInput?: React.ReactNode;
  /** Text box'ın üstünde gösterilen ek içerik (ajan oturum bilgi satırı). */
  aboveInput?: React.ReactNode;
};

/** Docked or main screen panel body — avatar-free chat box with attach + slash commands. */
export function AIChatPanel(props: AIChatPanelProps = {}) {
  const session = useOptionalYulaChat();
  if (!session?.activeId) {
    // activeId henüz senkron olarak set edilmediyse (ilk render anında) boş panel göster.
    return null;
  }
  return <AIChatPanelSession {...props} />;
}
