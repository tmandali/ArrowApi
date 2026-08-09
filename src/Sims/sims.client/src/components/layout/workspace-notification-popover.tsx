import * as React from "react"
import { useLocation, useNavigate } from "react-router-dom"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { SidebarMenuButton, useSidebar } from "@/components/ui/sidebar"
import {
  formatNotificationTime,
  useWorkspaceNotifications,
  type WorkspaceNotification,
  type WorkspaceNotificationType,
} from "@/context/workspace-notifications-context"
import {
  selectPendingJobs,
  useActiveJobsStore,
} from "@/store/slices/active-jobs-store"
import {
  resolveNotificationWorkspace,
  workspaceKeyFromPath,
} from "@/lib/workspace"
import { cn } from "@/utils/cn"
import { Bell, CheckCheck, Clock, LoaderCircle, Trash2 } from "lucide-react"

type MockNotification = Omit<WorkspaceNotification, "createdAt" | "workspace"> & {
  time: string
}

const mockNotifications: Record<string, MockNotification[]> = {
  "/selling": [
    {
      id: "s1",
      title: "Yeni Satış Siparişi",
      description:
        "Raymond firması SAL-ORD-2025-0039 numaralı siparişi onayladı.",
      time: "10 dakika önce",
      unread: true,
      type: "order",
    },
    {
      id: "s2",
      title: "Fason İrsaliyesi Tamamlandı",
      description: "SUB-ITEM-001 fason teslimatı tedarikçiye ulaştı.",
      time: "1 saat önce",
      unread: true,
      type: "order",
    },
    {
      id: "s3",
      title: "Ödeme Bekliyor",
      description:
        "Müşteri satın alma siparişi için avans ödemesi oluşturuldu.",
      time: "3 saat önce",
      unread: false,
      type: "order",
    },
  ],
  "/accounting": [
    {
      id: "a1",
      title: "Bilanço Raporu Güncellendi",
      description:
        "Consolidated Financial Report için dönemsel kapanış girdisi işlendi.",
      time: "5 dakika önce",
      unread: true,
      type: "report",
    },
    {
      id: "a2",
      title: "Kasa/Mizan Uyarısı",
      description:
        "Customer Ledger üzerinde tutarsızlık tespiti kontrol edildi.",
      time: "2 saat önce",
      unread: true,
      type: "report",
    },
  ],
  "/stock": [
    {
      id: "st1",
      title: "Seri No / İzlenebilirlik Kaydı",
      description:
        "M4 MacBook Air (M4MCBA0004) stok girişi başarıyla eklendi.",
      time: "15 dakika önce",
      unread: true,
      type: "stock",
    },
    {
      id: "st2",
      title: "Minimum Stok Seviyesi",
      description:
        "M4 Motherboard (M4MBD0001) stok seviyesi kritiğin altına düştü.",
      time: "4 saat önce",
      unread: true,
      type: "stock",
    },
  ],
  "/manufacturing": [
    {
      id: "m1",
      title: "Otomatik Stok Rezervasyonu",
      description:
        "Sales Order rezervasyonu için Auto Reserve Stock tetiklendi.",
      time: "20 dakika önce",
      unread: true,
      type: "manufacturing",
    },
    {
      id: "m2",
      title: "İş Emri (Work Order) Onayı",
      description: "BOM-M4-AIR-001 üretimi başarıyla başlatıldı.",
      time: "1 gün önce",
      unread: false,
      type: "manufacturing",
    },
  ],
}

type DisplayNotification = {
  id: string
  title: string
  description: string
  time: string
  unread: boolean
  type: WorkspaceNotificationType
  href?: string
  source: "pending" | "live" | "mock"
  pending?: boolean
}

function formatUnreadCount(count: number) {
  if (count > 99) return "99+"
  return String(count)
}

function createdAtMs(createdAt: string): number {
  const parsed = Date.parse(createdAt)
  return Number.isFinite(parsed) ? parsed : Date.now()
}

export function WorkspaceNotificationPopover() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const [open, setOpen] = React.useState(false)
  const { isMobile, state } = useSidebar()
  const iconCollapsed = !isMobile && state === "collapsed"
  const { notifications, markAsRead, markAllAsRead, markMockAsRead, isMockRead, isMockDismissed, clearRead } =
    useWorkspaceNotifications()
  const jobs = useActiveJobsStore((s) => s.jobs)
  const key = workspaceKeyFromPath(pathname)
  const pendingJobs = React.useMemo(
    () => selectPendingJobs(jobs, key),
    [jobs, key]
  )

  const mockList = mockNotifications[key] ?? mockNotifications["/selling"]

  const displayNotifications = React.useMemo<DisplayNotification[]>(() => {
    const pending = pendingJobs.map((job) => ({
      id: `pending-${job.id}`,
      title: job.title,
      description: `${job.status} — işlem devam ediyor…`,
      time: formatNotificationTime(createdAtMs(job.createdAt)),
      unread: true,
      type: job.notificationType as WorkspaceNotificationType,
      href: job.href,
      source: "pending" as const,
      pending: true,
    }))

    const live = notifications
      .filter((item) => resolveNotificationWorkspace(item) === key)
      .filter((item) => {
        if (!item.id.startsWith("job-")) return true
        const jobId = item.id.slice(4)
        return !pendingJobs.some((job) => job.id === jobId)
      })
      .map((item) => ({
        id: item.id,
        title: item.title,
        description: item.description,
        time: formatNotificationTime(item.createdAt),
        unread: item.unread,
        type: item.type,
        href: item.href,
        source: "live" as const,
      }))

    const mocks = mockList
      .filter((item) => !isMockDismissed(item.id))
      .map((item) => ({
        id: item.id,
        title: item.title,
        description: item.description,
        time: item.time,
        unread: item.unread && !isMockRead(item.id),
        type: item.type,
        href: item.href,
        source: "mock" as const,
      }))

    return [...pending, ...live, ...mocks]
  }, [notifications, mockList, pendingJobs, isMockRead, isMockDismissed, key])

  const unreadCount = displayNotifications.filter((n) => n.unread).length
  const readCount = displayNotifications.filter(
    (n) => !n.unread && n.source !== "pending"
  ).length

  const handleMarkAllAsRead = () => {
    markAllAsRead({
      workspace: key,
      mockIds: mockList.map((item) => item.id),
    })
  }

  const handleClearRead = () => {
    clearRead({
      workspace: key,
      mockIds: displayNotifications
        .filter((item) => item.source === "mock" && !item.unread)
        .map((item) => item.id),
    })
  }

  const handleOpenNotification = (item: DisplayNotification) => {
    if (item.source === "live") {
      markAsRead(item.id)
    } else if (item.source === "mock") {
      markMockAsRead(item.id)
    }

    if (item.href) {
      setOpen(false)
      navigate(item.href)
    }
  }

  const getWorkspaceTitle = () => {
    if (key === "/accounting") return "Financial Notifications"
    if (key === "/stock") return "Stock Notifications"
    if (key === "/manufacturing") return "Manufacturing Notifications"
    return "Subcontracting Notifications"
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <SidebarMenuButton
          tooltip="Notification"
          className="relative text-sidebar-foreground/70"
        >
          <Bell className="size-4 shrink-0" />
          <span className={cn("truncate", iconCollapsed && "hidden")}>
            Notification
          </span>
          {unreadCount > 0 ? (
            <Badge
              asChild
              variant="destructive"
              className={cn(
                "h-4 min-w-4 shrink-0 justify-center rounded-full px-1 text-[10px] tabular-nums",
                iconCollapsed
                  ? "absolute top-0 right-0 z-10 ml-0"
                  : "ml-auto"
              )}
            >
              <div>{formatUnreadCount(unreadCount)}</div>
            </Badge>
          ) : null}
        </SidebarMenuButton>
      </PopoverTrigger>
      <PopoverContent
        side="right"
        align="start"
        className="flex w-80 flex-col overflow-hidden p-0 shadow-xl"
      >
        <div className="flex shrink-0 items-center justify-between gap-2 border-b bg-muted/20 px-3 py-2.5">
          <div className="flex min-w-0 items-center gap-2">
            <Bell className="size-4 shrink-0 text-primary" />
            <h4 className="truncate text-xs font-semibold">
              {getWorkspaceTitle()}
            </h4>
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            {unreadCount > 0 ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 shrink-0 px-2 text-[11px] text-muted-foreground hover:text-foreground"
                onClick={handleMarkAllAsRead}
              >
                <CheckCheck className="size-3.5" />
                Mark all
              </Button>
            ) : null}
            {readCount > 0 ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 shrink-0 px-2 text-[11px] text-muted-foreground hover:text-foreground"
                onClick={handleClearRead}
              >
                <Trash2 className="size-3.5" />
                Clear read
              </Button>
            ) : null}
          </div>
        </div>

        <ScrollArea className="h-80">
          <div className="divide-y">
            {displayNotifications.length === 0 ? (
              <div className="p-6 text-center text-xs text-muted-foreground">
                Bu çalışma alanında bildirim bulunmuyor.
              </div>
            ) : (
              displayNotifications.map((item) => (
                <button
                  key={`${item.source}-${item.id}`}
                  type="button"
                  className={cn(
                    "flex w-full flex-col gap-1 p-3 text-left text-xs transition-colors hover:bg-muted/40",
                    item.unread && "bg-primary/5",
                    item.href ? "cursor-pointer" : "cursor-default"
                  )}
                  onClick={() => handleOpenNotification(item)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-1.5 font-medium text-foreground">
                      {item.pending ? (
                        <LoaderCircle className="size-3.5 shrink-0 animate-spin text-primary" />
                      ) : item.unread ? (
                        <span className="size-1.5 shrink-0 rounded-full bg-primary" />
                      ) : null}
                      <span className="truncate">{item.title}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1 text-[10px] text-muted-foreground">
                      <Clock className="size-3" />
                      {item.time}
                    </span>
                  </div>
                  <p className="line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">
                    {item.description}
                  </p>
                </button>
              ))
            )}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  )
}
