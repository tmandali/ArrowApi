import * as React from "react"

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
  href?: string
}

type WorkspaceNotificationsContextValue = {
  notifications: WorkspaceNotification[]
  pushNotification: (
    input: Omit<WorkspaceNotification, "id" | "createdAt" | "unread"> & {
      id?: string
      unread?: boolean
    }
  ) => void
  markAsRead: (id: string) => void
  markAllAsRead: () => void
}

const WorkspaceNotificationsContext =
  React.createContext<WorkspaceNotificationsContextValue | null>(null)

export function WorkspaceNotificationsProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [notifications, setNotifications] = React.useState<
    WorkspaceNotification[]
  >([])

  const pushNotification = React.useCallback(
    (
      input: Omit<WorkspaceNotification, "id" | "createdAt" | "unread"> & {
        id?: string
        unread?: boolean
      }
    ) => {
      const next: WorkspaceNotification = {
        id: input.id ?? `n-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        title: input.title,
        description: input.description,
        type: input.type,
        href: input.href,
        createdAt: Date.now(),
        unread: input.unread ?? true,
      }
      setNotifications((prev) => [next, ...prev])
    },
    []
  )

  const markAsRead = React.useCallback((id: string) => {
    setNotifications((prev) =>
      prev.map((item) => (item.id === id ? { ...item, unread: false } : item))
    )
  }, [])

  const markAllAsRead = React.useCallback(() => {
    setNotifications((prev) => prev.map((item) => ({ ...item, unread: false })))
  }, [])

  const value = React.useMemo(
    () => ({
      notifications,
      pushNotification,
      markAsRead,
      markAllAsRead,
    }),
    [notifications, pushNotification, markAsRead, markAllAsRead]
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
