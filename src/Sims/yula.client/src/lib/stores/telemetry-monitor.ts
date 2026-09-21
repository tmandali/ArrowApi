import { create } from "zustand";

export type DetailPanelView = "diagram" | "telemetry";

interface TelemetryMonitorState {
  isOpen: boolean;
  activeView: DetailPanelView;
  open: (view?: DetailPanelView) => void;
  close: () => void;
  toggle: (view?: DetailPanelView) => void;
  setActiveView: (view: DetailPanelView) => void;
}

export const useTelemetryMonitorStore = create<TelemetryMonitorState>((set) => ({
  isOpen: false,
  activeView: "telemetry",
  open: (view = "telemetry") => set({ isOpen: true, activeView: view }),
  close: () => set({ isOpen: false }),
  toggle: (view) =>
    set((s) => {
      if (s.isOpen) {
        if (view && s.activeView !== view) {
          return { isOpen: true, activeView: view };
        }
        return { isOpen: false };
      }
      return { isOpen: true, activeView: view ?? s.activeView };
    }),
  setActiveView: (view) => set({ activeView: view, isOpen: true }),
}));
