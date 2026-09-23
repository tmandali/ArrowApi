import { create } from "zustand";

export interface ScreenJourneyEntry {
  route: string;
  screenTitle: string;
  enteredAt: number;
  exitedAt?: number;
  exitSnapshot?: Record<string, unknown>;
}

export interface ScreenJourneyState {
  journey: ScreenJourneyEntry[];
  recordScreenEnter: (route: string, screenTitle: string) => void;
  recordScreenExit: (route: string, exitSnapshot?: Record<string, unknown>) => void;
  getRecentTrail: (limit?: number) => ScreenJourneyEntry[];
  clearJourney: () => void;
}

export const useScreenJourneyStore = create<ScreenJourneyState>((set, get) => ({
  journey: [],

  recordScreenEnter: (route, screenTitle) => {
    set((state) => {
      const now = Date.now();
      const last = state.journey[state.journey.length - 1];

      // If the same route is already the active last entry, don't duplicate
      if (last && last.route === route && !last.exitedAt) {
        return state;
      }

      // Close previous unclosed entry if any
      const updated = state.journey.map((item, idx) =>
        idx === state.journey.length - 1 && !item.exitedAt
          ? { ...item, exitedAt: now }
          : item
      );

      return {
        journey: [
          ...updated,
          {
            route,
            screenTitle,
            enteredAt: now,
          },
        ],
      };
    });
  },

  recordScreenExit: (route, exitSnapshot) => {
    set((state) => {
      const now = Date.now();
      return {
        journey: state.journey.map((item) =>
          item.route === route && !item.exitedAt
            ? { ...item, exitedAt: now, exitSnapshot: exitSnapshot ?? item.exitSnapshot }
            : item
        ),
      };
    });
  },

  getRecentTrail: (limit = 5) => {
    const list = get().journey;
    return list.slice(-limit);
  },

  clearJourney: () => {
    set({ journey: [] });
  },
}));
