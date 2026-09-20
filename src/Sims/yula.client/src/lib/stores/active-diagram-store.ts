import { create } from "zustand";

export interface ActiveDiagram {
  id: string;
  title: string;
  chart: string;
  diagramType: string;
}

interface ActiveDiagramState {
  activeDiagram: ActiveDiagram | null;
  isOpen: boolean;
  isMaximized: boolean;
  openDiagram: (diagram: ActiveDiagram) => void;
  closeDiagram: () => void;
  toggleDiagram: (diagram: ActiveDiagram) => void;
  toggleMaximize: () => void;
  setMaximized: (maximized: boolean) => void;
}

export const useActiveDiagramStore = create<ActiveDiagramState>((set, get) => ({
  activeDiagram: null,
  isOpen: false,
  isMaximized: false,
  openDiagram: (diagram) =>
    set({
      activeDiagram: diagram,
      isOpen: true,
    }),
  closeDiagram: () =>
    set({
      isOpen: false,
      activeDiagram: null,
      isMaximized: false,
    }),
  toggleDiagram: (diagram) => {
    const current = get().activeDiagram;
    if (current?.id === diagram.id && get().isOpen) {
      set({ isOpen: false, activeDiagram: null, isMaximized: false });
    } else {
      set({ activeDiagram: diagram, isOpen: true });
    }
  },
  toggleMaximize: () => set((state) => ({ isMaximized: !state.isMaximized })),
  setMaximized: (maximized) => set({ isMaximized: maximized }),
}));
