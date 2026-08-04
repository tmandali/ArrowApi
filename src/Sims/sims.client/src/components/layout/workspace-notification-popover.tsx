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
import { SidebarMenuButton } from "@/components/ui/sidebar"
import {
  formatNotificationTime,
  useWorkspaceNotifications,
  type WorkspaceNotification,
  type WorkspaceNotificationType,
} from "@/context/workspace-notifications"
import { cn } from "@/utils/cn"
import { Bell, CheckCheck, Clock } from "lucide-react"

type MockNotification = Omit<WorkspaceNotification, "createdAt"> & {
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
  source: "live" | "mock"
}

function workspaceKey(pathname: string) {
  if (pathname.startsWith("/stock")) return "/stock"
  if (pathname.startsWith("/accounting")) return "/accounting"
  if (pathname.startsWith("/manufacturing")) return "/manufacturing"
  if (pathname.startsWith("/selling")) return "/selling"
  return pathname
}

function formatUnreadCount(count: number) {
  if (count > 99) return "99+"
  return String(count)
}

export function WorkspaceNotificationPopover() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const [open, setOpen] = React.useState(false)
  const { notifications, markAsRead, markAllAsRead } =
    useWorkspaceNotifications()
  const [readMockIds, setReadMockIds] = React.useState<Set<string>>(
    () => new Set()
  )

  const key = workspaceKey(pathname)
  const mockList = mockNotifications[key] ?? mockNotifications["/selling"]

  const displayNotifications = React.useMemo<DisplayNotification[]>(() => {
    const live = notifications.map((item) => ({
      id: item.id,
      title: item.title,
      description: item.description,
      time: formatNotificationTime(item.createdAt),
      unread: item.unread,
      type: item.type,
      href: item.href,
      source: "live" as const,
    }))

    const mocks = mockList.map((item) => ({
      id: item.id,
      title: item.title,
      description: item.description,
      time: item.time,
      unread: item.unread && !readMockIds.has(item.id),
      type: item.type,
      href: item.href,
      source: "mock" as const,
    }))

    return [...live, ...mocks]
  }, [notifications, mockList, readMockIds])

  const unreadCount = displayNotifications.filter((n) => n.unread).length

  const handleMarkAllAsRead = () => {
    markAllAsRead()
    setReadMockIds(new Set(mockList.map((item) => item.id)))
  }

  const handleOpenNotification = (item: DisplayNotification) => {
    if (item.source === "live") {
      markAsRead(item.id)
    } else {
      setReadMockIds((prev) => new Set(prev).add(item.id))
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
          <span className="truncate">Notification</span>
          {unreadCount > 0 ? (
            <Badge
              variant="destructive"
              className={cn(
                "ml-auto h-4 min-w-4 shrink-0 justify-center rounded-full px-1 text-[10px] tabular-nums",
                "group-data-[collapsible=icon]:absolute group-data-[collapsible=icon]:top-1 group-data-[collapsible=icon]:right-1 group-data-[collapsible=icon]:ml-0"
              )}
            >
              {formatUnreadCount(unreadCount)}
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
                      {item.unread ? (
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
