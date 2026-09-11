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

// Persist değerini senkron oku — hydrasyon microtask'ı beklemeksizin
// ilk render'da dock açık/kapalı durumu doğru başlar.
const getSyncDockOpen = (): boolean => {
  try {
    const raw = typeof localStorage !== "undefined"
      ? localStorage.getItem("yula-dock-state")
      : null;
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { state?: { open?: boolean } };
    return parsed?.state?.open ?? false;
  } catch {
    return false;
  }
};

export const useYulaDockStore = create<DockState>()(
  persist(
    (set, get) => ({
      open: getSyncDockOpen(),
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
  ),
);
