import { create } from "zustand";

interface DockState {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
}

export const useYulaDockStore = create<DockState>((set, get) => ({
  open: false,
  setOpen: (open) => set({ open }),
  toggle: () => set({ open: !get().open }),
}));
