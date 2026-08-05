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
  clear: () => void
}

export const useNotificationsStore = create<NotificationsState>()(
  persist(
    (set, get) => ({
      notifications: [],
      readMockIds: [],
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
      clear: () => set({ notifications: [], readMockIds: [] }),
    }),
    {
      name: "sims:notifications",
      partialize: (state) => ({
        notifications: state.notifications,
        readMockIds: state.readMockIds,
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
        }
      },
    }
  )
)
