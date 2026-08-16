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
  readMockIds: string[]
  dismissedMockIds: string[]
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
  markAllAsRead: (options?: {
    workspace?: WorkspaceKey
    mockIds?: string[]
  }) => void
  markMockAsRead: (id: string) => void
  isMockRead: (id: string) => boolean
  isMockDismissed: (id: string) => boolean
  removeNotification: (id: string) => void
  removeNotificationByJobId: (jobId: string) => void
  dismissMock: (id: string) => void
  clearRead: (options?: {
    workspace?: WorkspaceKey
    mockIds?: string[]
  }) => void
  clear: () => void
}

export const useNotificationsStore = create<NotificationsState>()(
  persist(
    (set, get) => ({
      notifications: [],
      readMockIds: [],
      dismissedMockIds: [],
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
        const { workspace, mockIds = [] } = options
        const readMockIds = new Set(get().readMockIds)
        for (const id of mockIds) {
          readMockIds.add(id)
        }
        set({
          notifications: get().notifications.map((item) => {
            const itemWorkspace = resolveNotificationWorkspace(item)
            if (workspace && itemWorkspace !== workspace) {
              return item
            }
            return { ...item, unread: false }
          }),
          readMockIds: [...readMockIds],
        })
      },
      markMockAsRead: (id) => {
        if (get().readMockIds.includes(id)) return
        set({ readMockIds: [...get().readMockIds, id] })
      },
      isMockRead: (id) => get().readMockIds.includes(id),
      isMockDismissed: (id) => get().dismissedMockIds.includes(id),
      dismissMock: (id) => {
        if (get().dismissedMockIds.includes(id)) return
        set({ dismissedMockIds: [...get().dismissedMockIds, id] })
      },
      clearRead: (options = {}) => {
        const { workspace, mockIds = [] } = options
        const dismissedMockIds = new Set(get().dismissedMockIds)
        for (const id of mockIds) {
          dismissedMockIds.add(id)
        }
        set({
          notifications: get().notifications.filter((item) => {
            if (item.unread) return true
            if (workspace && resolveNotificationWorkspace(item) !== workspace) {
              return true
            }
            return false
          }),
          dismissedMockIds: [...dismissedMockIds],
        })
      },
      clear: () =>
        set({ notifications: [], readMockIds: [], dismissedMockIds: [] }),
    }),
    {
      name: "sims:notifications",
      partialize: (state) => ({
        notifications: state.notifications,
        readMockIds: state.readMockIds,
        dismissedMockIds: state.dismissedMockIds,
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
          readMockIds: raw.readMockIds ?? [],
          dismissedMockIds: raw.dismissedMockIds ?? [],
        }
      },
    }
  )
)
