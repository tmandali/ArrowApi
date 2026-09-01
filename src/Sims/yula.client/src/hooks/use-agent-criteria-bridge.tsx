"use client";

import { create } from "zustand";

/**
 * Yula'nın kriter formu alanlarını AI ile doldurduğu bilgisini taşır.
 * Eski agent-bridge karşılığının sadeleştirilmiş hali — kalıcı DEĞİL,
 * oturum içi vurgulama içindir.
 */
interface CriteriaFillEntry {
  names: string[];
  at: number;
}

interface AgentCriteriaState {
  aiFilledCriteria: Record<string, CriteriaFillEntry>;
  recordAiFilledCriteria: (scope: string, names: string[]) => void;
  clearAiFilledCriteria: () => void;
}

export const useAgentCriteriaStore = create<AgentCriteriaState>((set) => ({
  aiFilledCriteria: {},
  recordAiFilledCriteria: (scope, names) =>
    set((s) => ({
      aiFilledCriteria: {
        ...s.aiFilledCriteria,
        [scope]: { names, at: Date.now() },
      },
    })),
  clearAiFilledCriteria: () =>
    set(() => ({ aiFilledCriteria: {} })),
}));
