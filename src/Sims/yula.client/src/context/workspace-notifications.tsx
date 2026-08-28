"use client";

import * as React from "react"
import { useNotificationsStore } from "@/store/slices/notifications-store"
import {
  WorkspaceNotificationsContext,
  type WorkspaceNotificationsContextValue,
} from "./workspace-notifications-context"

export function WorkspaceNotificationsProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const notifications = useNotificationsStore((s) => s.notifications)
  const pushNotification = useNotificationsStore((s) => s.pushNotification)
  const markAsRead = useNotificationsStore((s) => s.markAsRead)
  const markAllAsRead = useNotificationsStore((s) => s.markAllAsRead)
  const removeNotification = useNotificationsStore((s) => s.removeNotification)
  const removeNotificationByJobId = useNotificationsStore(
    (s) => s.removeNotificationByJobId
  )
  const clearRead = useNotificationsStore((s) => s.clearRead)
  const clear = useNotificationsStore((s) => s.clear)

  const value = React.useMemo<WorkspaceNotificationsContextValue>(
    () => ({
      notifications,
      pushNotification,
      markAsRead,
      markAllAsRead,
      removeNotification,
      removeNotificationByJobId,
      clearRead,
      clearNotifications: clear,
    }),
    [
      notifications,
      pushNotification,
      markAsRead,
      markAllAsRead,
      removeNotification,
      removeNotificationByJobId,
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
