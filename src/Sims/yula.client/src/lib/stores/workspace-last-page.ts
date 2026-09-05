import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { WorkspaceId } from "@/types";

interface WorkspaceLastPageState {
  /** Her workspace'te son ziyaret edilen sayfa — rail ikonları bunu açar. */
  lastPathById: Record<string, string>;
  setLastPath: (id: WorkspaceId, path: string) => void;
}

export const useWorkspaceLastPageStore = create<WorkspaceLastPageState>()(
  persist(
    (set) => ({
      lastPathById: {},
      setLastPath: (id, path) => {
        // Yalnızca o workspace'e ait rotaları kaydet (çapraz kirlenmeyi önler)
        if (!path || !path.startsWith(`/${id}`)) return;
        set((s) => ({ lastPathById: { ...s.lastPathById, [id]: path } }));
      },
    }),
    {
      name: "yula-workspace-last-page",
      partialize: (state) => ({ lastPathById: state.lastPathById }),
      onRehydrateStorage: () => (state) => {
        if (!state?.lastPathById) return;
        // Bayat veya çapraz karışmış localStorage kayıtlarını temizle
        const cleaned: Record<string, string> = {};
        for (const [id, path] of Object.entries(state.lastPathById)) {
          if (path && path.startsWith(`/${id}`)) {
            cleaned[id] = path;
          }
        }
        state.lastPathById = cleaned;
      },
    }
  )
);
