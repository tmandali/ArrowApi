import { create } from "zustand"
import { persist } from "zustand/middleware"
import type { WorkspaceKey } from "@/lib/workspace"
import { resolveNotificationWorkspace } from "@/lib/workspace"

export type WorkspaceNotificationType =
  | "order"
  | "report"
  | "stock"
  | "manufacturing"

export type WorkspaceNotification = {
  id: string
  title: string
  description: string
  createdAt: number
  unread: boolean
  type: WorkspaceNotificationType
  /** Bildirimin ait olduğu workspace (ör. /stock). */
  workspace: WorkspaceKey
  href?: string
}

type NotificationsState = {
  notifications: WorkspaceNotification[]
  pushNotification: (
    input: Omit<
      WorkspaceNotification,
      "id" | "createdAt" | "unread" | "workspace"
    > & {
      id?: string
      unread?: boolean
      workspace?: WorkspaceKey
    }
  ) => void
  markAsRead: (id: string) => void
  markAllAsRead: (options?: { workspace?: WorkspaceKey }) => void
  removeNotification: (id: string) => void
  removeNotificationByJobId: (jobId: string) => void
  clearRead: (options?: { workspace?: WorkspaceKey }) => void
  clear: () => void
}

export const useNotificationsStore = create<NotificationsState>()(
  persist(
    (set, get) => ({
      notifications: [],
      pushNotification: (input) => {
        const next: WorkspaceNotification = {
          id:
            input.id ??
            `n-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          title: input.title,
          description: input.description,
          type: input.type,
          href: input.href,
          workspace: resolveNotificationWorkspace({
            workspace: input.workspace,
            href: input.href,
            type: input.type,
          }),
          createdAt: Date.now(),
          unread: input.unread ?? true,
        }
        const prev = get().notifications
        if (input.id && prev.some((item) => item.id === input.id)) {
          return
        }
        set({ notifications: [next, ...prev] })
      },
      removeNotification: (id) => {
        set({
          notifications: get().notifications.filter((item) => item.id !== id),
        })
      },
      removeNotificationByJobId: (jobId) => {
        if (!jobId) return
        const targetPrefix = `job-${jobId}`
        set({
          notifications: get().notifications.filter((item) => {
            if (item.id === targetPrefix || item.id === jobId) return false
            if (
              item.href &&
              (item.href.endsWith(`/${jobId}`) ||
                item.href.includes(`/${jobId}/`) ||
                item.href.includes(`jobId=${jobId}`))
            ) {
              return false
            }
            return true
          }),
        })
      },
      markAsRead: (id) => {
        set({
          notifications: get().notifications.map((item) =>
            item.id === id ? { ...item, unread: false } : item
          ),
        })
      },
      markAllAsRead: (options = {}) => {
        const { workspace } = options
        set({
          notifications: get().notifications.map((item) => {
            const itemWorkspace = resolveNotificationWorkspace(item)
            if (workspace && itemWorkspace !== workspace) {
              return item
            }
            return { ...item, unread: false }
          }),
        })
      },
      clearRead: (options = {}) => {
        const { workspace } = options
        set({
          notifications: get().notifications.filter((item) => {
            if (item.unread) return true
            if (workspace && resolveNotificationWorkspace(item) !== workspace) {
              return true
            }
            return false
          }),
        })
      },
      clear: () => set({ notifications: [] }),
    }),
    {
      name: "sims:notifications",
      partialize: (state) => ({
        notifications: state.notifications,
      }),
      merge: (persisted, current) => {
        const raw = (persisted ?? {}) as Partial<NotificationsState>
        const notifications = (raw.notifications ?? []).map((item) => ({
          ...item,
          workspace: resolveNotificationWorkspace(item),
        }))
        return {
          ...current,
          ...raw,
          notifications,
        }
      },
    }
  )
)
