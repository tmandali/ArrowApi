import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface RegisteredPagePanel {
  id: string;
  title: string;
  defaultOpen: boolean;
}

interface PagePanelState {
  /** Session-scoped registration — the page body mounts/unmounts it. */
  registered: RegisteredPagePanel | null;
  /** Persisted per-panel open flags; missing id falls back to defaultOpen. */
  openById: Record<string, boolean>;
  register: (panel: RegisteredPagePanel) => void;
  unregister: (id: string) => void;
  setOpen: (id: string, open: boolean) => void;
}

export const usePagePanelStore = create<PagePanelState>()(
  persist(
    (set) => ({
      registered: null,
      openById: {},
      register: (panel) => set({ registered: panel }),
      unregister: (id) =>
        set((s) => (s.registered?.id === id ? { registered: null } : {})),
      setOpen: (id, open) =>
        set((s) => ({ openById: { ...s.openById, [id]: open } })),
    }),
    {
      name: "yula-page-panel-state",
      partialize: (state) => ({ openById: state.openById }),
    }
  )
);
