import { create } from "zustand";
import type { ScreenCategory, ScreenContract } from "@/lib/contracts/screen-contract";
import { useScreenJourneyStore } from "./screen-journey-store";

export interface ActiveScreenInfo {
  screenId: string;
  screenTitle: string;
  category: ScreenCategory;
  workspace: string;
  promptGuidelines?: string[];
  i18nNamespace?: string;
}

export interface ActiveScreenState {
  activeScreen: ActiveScreenInfo | null;
  state: Record<string, unknown>;
  quickPrompts: string[];
  history: Array<Record<string, unknown>>;
  canUndo: boolean;

  setScreen: (
    contract: ScreenContract<any, any>,
    initialState?: Record<string, unknown>,
    quickPrompts?: string[],
  ) => void;
  updateState: (partial: Record<string, unknown>, pushHistory?: boolean) => void;
  setQuickPrompts: (prompts: string[]) => void;
  undo: () => Record<string, unknown> | null;
  clearScreen: () => void;
  restoreDraft: (route: string) => Record<string, unknown> | null;
}

const MAX_HISTORY_LIMIT = 20;

export const useActiveScreenStore = create<ActiveScreenState>((set, get) => ({
  activeScreen: null,
  state: {},
  quickPrompts: [],
  history: [],
  canUndo: false,

  setScreen: (contract, initialState = {}, quickPrompts = []) => {
    set({
      activeScreen: {
        screenId: contract.screenId,
        screenTitle: contract.screenTitle,
        category: contract.category,
        workspace: contract.workspace,
        promptGuidelines: contract.promptGuidelines,
        i18nNamespace: contract.i18nNamespace,
      },
      state: { ...initialState },
      quickPrompts: [...quickPrompts],
      history: [],
      canUndo: false,
    });
  },

  updateState: (partial, pushHistory = false) => {
    set((s) => {
      const nextState = { ...s.state, ...partial };
      if (!pushHistory) {
        return { state: nextState };
      }
      const updatedHistory = [...s.history, s.state].slice(-MAX_HISTORY_LIMIT);
      return {
        state: nextState,
        history: updatedHistory,
        canUndo: updatedHistory.length > 0,
      };
    });
  },

  setQuickPrompts: (prompts) => {
    set({ quickPrompts: [...prompts] });
  },

  undo: () => {
    const s = get();
    if (s.history.length === 0) return null;
    const previous = s.history[s.history.length - 1];
    const newHistory = s.history.slice(0, -1);
    set({
      state: { ...previous },
      history: newHistory,
      canUndo: newHistory.length > 0,
    });
    return previous;
  },

  clearScreen: () => {
    set({
      activeScreen: null,
      state: {},
      quickPrompts: [],
      history: [],
      canUndo: false,
    });
  },

  restoreDraft: (route: string) => {
    const journey = useScreenJourneyStore.getState().journey;
    const lastVisit = [...journey].reverse().find((v) => v.route === route && v.exitSnapshot);
    if (lastVisit?.exitSnapshot) {
      set((s) => ({
        state: { ...s.state, ...lastVisit.exitSnapshot },
      }));
      return lastVisit.exitSnapshot;
    }
    return null;
  },
}));
