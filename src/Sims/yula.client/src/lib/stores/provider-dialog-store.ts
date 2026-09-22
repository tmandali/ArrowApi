import { create } from "zustand";

interface ProviderDialogState {
  isOpen: boolean;
  targetProvider: string;
  openDialog: (provider?: string) => void;
  closeDialog: () => void;
}

export const useProviderDialogStore = create<ProviderDialogState>((set) => ({
  isOpen: false,
  targetProvider: "",
  openDialog: (provider = "") => set({ isOpen: true, targetProvider: provider }),
  closeDialog: () => set({ isOpen: false, targetProvider: "" }),
}));
