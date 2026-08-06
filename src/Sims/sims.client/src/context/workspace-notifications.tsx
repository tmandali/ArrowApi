import * as React from "react"
import {
  useNotificationsStore,
  type WorkspaceNotification,
  type WorkspaceNotificationType,
} from "@/store/slices/notifications-store"
import type { WorkspaceKey } from "@/lib/workspace"

export type { WorkspaceNotification, WorkspaceNotificationType }

type WorkspaceNotificationsContextValue = {
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
  markAllAsRead: (options?: {
    workspace?: WorkspaceKey
    mockIds?: string[]
  }) => void
  markMockAsRead: (id: string) => void
  isMockRead: (id: string) => boolean
  isMockDismissed: (id: string) => boolean
  clearRead: (options?: {
    workspace?: WorkspaceKey
    mockIds?: string[]
  }) => void
  clearNotifications: () => void
}

const WorkspaceNotificationsContext =
  React.createContext<WorkspaceNotificationsContextValue | null>(null)

export function WorkspaceNotificationsProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const notifications = useNotificationsStore((s) => s.notifications)
  const pushNotification = useNotificationsStore((s) => s.pushNotification)
  const markAsRead = useNotificationsStore((s) => s.markAsRead)
  const markAllAsRead = useNotificationsStore((s) => s.markAllAsRead)
  const markMockAsRead = useNotificationsStore((s) => s.markMockAsRead)
  const isMockRead = useNotificationsStore((s) => s.isMockRead)
  const isMockDismissed = useNotificationsStore((s) => s.isMockDismissed)
  const clearRead = useNotificationsStore((s) => s.clearRead)
  const clear = useNotificationsStore((s) => s.clear)

  const value = React.useMemo(
    () => ({
      notifications,
      pushNotification,
      markAsRead,
      markAllAsRead,
      markMockAsRead,
      isMockRead,
      isMockDismissed,
      clearRead,
      clearNotifications: clear,
    }),
    [
      notifications,
      pushNotification,
      markAsRead,
      markAllAsRead,
      markMockAsRead,
      isMockRead,
      isMockDismissed,
      clearRead,
      clear,
    ]
  )

  return (
    <WorkspaceNotificationsContext.Provider value={value}>
      {children}
    </WorkspaceNotificationsContext.Provider>
  )
}

export function useWorkspaceNotifications() {
  const context = React.useContext(WorkspaceNotificationsContext)
  if (!context) {
    throw new Error(
      "useWorkspaceNotifications must be used within WorkspaceNotificationsProvider"
    )
  }
  return context
}

export function formatNotificationTime(createdAt: number) {
  const diffMs = Date.now() - createdAt
  const minutes = Math.max(0, Math.floor(diffMs / 60_000))
  if (minutes < 1) return "Az önce"
  if (minutes < 60) return `${minutes} dakika önce`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} saat önce`
  const days = Math.floor(hours / 24)
  return `${days} gün önce`
}
