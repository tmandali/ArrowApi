import { useJobSync } from "@/context/job-sync-provider"
import { useNotificationsStore } from "@/store/slices/notifications-store"

/**
 * Auth henüz stub. Login/logout wiring geldiğinde bu hook'u kullanın:
 * - login sonrası: resyncJobSession()
 * - logout: clearJobSession()
 */
export function useJobSession() {
  const { resync, clearSession } = useJobSync()
  const clearNotifications = useNotificationsStore((s) => s.clear)

  return {
    resyncJobSession: resync,
    clearJobSession: () => {
      clearSession()
      clearNotifications()
    },
  }
}
