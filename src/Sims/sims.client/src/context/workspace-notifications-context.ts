import * as React from "react"
import type {
  WorkspaceNotification,
  WorkspaceNotificationType,
} from "@/store/slices/notifications-store"
import type { WorkspaceKey } from "@/lib/workspace"

export type { WorkspaceNotification, WorkspaceNotificationType }

export type WorkspaceNotificationsContextValue = {
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
  clearNotifications: () => void
}

export const WorkspaceNotificationsContext =
  React.createContext<WorkspaceNotificationsContextValue | null>(null)

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
