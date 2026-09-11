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

/**
 * Zaman-once etiketlerini üreten çeviri fonksiyonu (next-intl `t`).
 * Modül seviyesinde hook kullanılamadığından çağranda `useTranslations("Notifications")`
 * ile sağlanır.
 */
export type TimeAgoTranslator = (key: "just_now" | "minutes_ago" | "hours_ago" | "days_ago", values?: { count?: number }) => string

export function formatNotificationTime(createdAt: number, t: TimeAgoTranslator) {
  const diffMs = Date.now() - createdAt
  const minutes = Math.max(0, Math.floor(diffMs / 60_000))
  if (minutes < 1) return t("just_now")
  if (minutes < 60) return t("minutes_ago", { count: minutes })
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return t("hours_ago", { count: hours })
  const days = Math.floor(hours / 24)
  return t("days_ago", { count: days })
}
