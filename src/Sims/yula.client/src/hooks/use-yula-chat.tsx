"use client";

import * as React from "react";
import { YulaChatContext } from "./yula-chat-context";

export function useYulaChat() {
  const ctx = React.useContext(YulaChatContext);
  if (!ctx) {
    throw new Error("useYulaChat must be used within <YulaChatProvider>");
  }
  return ctx;
}

/**
 * Atmayan (throw etmeyen) varyant: sohbet oturumu henüz hazır olmadığında
 * null döner. Uygulama kabuğu artık provider'a bağımsız render edildiği için
 * panel bileşenleri (AIChatPanel) oturum bekleme durumunu böyle algılar.
 */
export function useYulaChatOrNull() {
  return React.useContext(YulaChatContext);
}
