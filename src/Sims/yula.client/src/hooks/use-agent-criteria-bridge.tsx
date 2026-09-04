"use client";

import { create } from "zustand";

/**
 * Yula'nın kriter formu alanlarını AI ile doldurduğu bilgisini taşır.
 * Eski agent-bridge karşılığının sadeleştirilmiş hali — kalıcı DEĞİL,
 * oturum içi vurgulama içindir. Kayıtlar EXPIRY_MS sonra otomatik düşer;
 * tüketiciler saat hesabı yapmadan (pure render) sadece `names` okur.
 */
const EXPIRY_MS = 10 * 60_000;

interface CriteriaFillEntry {
  names: string[];
  at: number;
}

interface AgentCriteriaState {
  aiFilledCriteria: Record<string, CriteriaFillEntry>;
  recordAiFilledCriteria: (scope: string, names: string[]) => void;
  clearAiFilledCriteria: () => void;
}

const expiryTimers = new Map<string, ReturnType<typeof setTimeout>>();

export const useAgentCriteriaStore = create<AgentCriteriaState>((set) => ({
  aiFilledCriteria: {},
  recordAiFilledCriteria: (scope, names) => {
    set((s) => ({
      aiFilledCriteria: {
        ...s.aiFilledCriteria,
        [scope]: { names, at: Date.now() },
      },
    }));
    const previous = expiryTimers.get(scope);
    if (previous) clearTimeout(previous);
    expiryTimers.set(
      scope,
      setTimeout(() => {
        expiryTimers.delete(scope);
        set((s) => {
          if (!(scope in s.aiFilledCriteria)) return s;
          const next = { ...s.aiFilledCriteria };
          delete next[scope];
          return { aiFilledCriteria: next };
        });
      }, EXPIRY_MS),
    );
  },
  clearAiFilledCriteria: () => {
    for (const timer of expiryTimers.values()) clearTimeout(timer);
    expiryTimers.clear();
    set(() => ({ aiFilledCriteria: {} }));
  },
}));
