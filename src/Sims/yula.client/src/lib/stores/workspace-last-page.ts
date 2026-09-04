import { create } from "zustand"
import { persist } from "zustand/middleware"
import type { WorkspaceId } from "@/lib/workspace-nav"

interface WorkspaceLastPageState {
  /** Her workspace'te son ziyaret edilen sayfa — rail ikonları bunu açar. */
  lastPathById: Record<string, string>
  setLastPath: (id: WorkspaceId, path: string) => void
}

export const useWorkspaceLastPageStore = create<WorkspaceLastPageState>()(
  persist(
    (set) => ({
      lastPathById: {},
      setLastPath: (id, path) =>
        set((s) => ({ lastPathById: { ...s.lastPathById, [id]: path } })),
    }),
    {
      name: "yula-workspace-last-page",
      partialize: (state) => ({ lastPathById: state.lastPathById }),
    }
  )
)
