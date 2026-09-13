"use client";

import * as React from "react";
import { useTranslations } from "next-intl";

/** Saft render yardımcılarına `useTranslations("ChatMarkdown")` taşınır. */
export type ChatMarkdownT = ReturnType<typeof useTranslations>;

export interface ChatMarkdownCallbacks {
  /** Tırnaklı öneri/bulgu prompt'u gönder */
  onPrompt: (text: string) => void;
  /** Onay mesajı bağlamında rapor/eq sayfasına yönlenir; yönlenemezse false */
  onNavigateReport: (reportTitle: string) => boolean;
  isExecutionConfirmation: boolean;
  /** Bulgu → filtre prompt çıkarımı için açık grid kolonları */
  columns: string[];
  /** Turun analizinin üretildiği kaynak tablo (yoksa aktif view kullanılır) */
  sourceTable?: string | null;
  /**
   * Metin-içi "çalıştır" tıklaması önce buraya delege edilir (ekranın Run
   * akışı); true dönerse koştu sayılır, aksi halde metin prompt olarak gider.
   */
  onRunReport?: () => boolean;
  /**
   * Kriter yankısı başlıkları (küçük harf): bu başlıklı maddeler bulgu
   * değildir, statik render edilir (tıklama yok).
   */
  staticTitles?: string[];
}

export const ChatMarkdownCallbacksContext =
  React.createContext<ChatMarkdownCallbacks | null>(null);

export function useChatMarkdownCallbacks(): ChatMarkdownCallbacks {
  const ctx = React.useContext(ChatMarkdownCallbacksContext);
  if (!ctx) {
    throw new Error("ChatMarkdownLink must be used within <ChatMarkdown />");
  }
  return ctx;
}
