import { create } from "zustand";
import { persist } from "zustand/middleware";

interface DockState {
  open: boolean;
  expanded: boolean;
  setOpen: (open: boolean) => void;
  setExpanded: (expanded: boolean) => void;
  toggle: () => void;
  toggleExpanded: () => void;
}

export const useYulaDockStore = create<DockState>()(
  persist(
    (set, get) => ({
      open: false,
      expanded: false,
      setOpen: (open) =>
        set({
          open,
          expanded: open ? get().expanded : false,
        }),
      setExpanded: (expanded) => set({ expanded }),
      toggle: () =>
        set((s) => ({
          open: !s.open,
          expanded: !s.open ? s.expanded : false,
        })),
      toggleExpanded: () => set((s) => ({ expanded: !s.expanded })),
    }),
    {
      name: "yula-dock-state",
    }
  )
);
