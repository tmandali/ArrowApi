import * as React from "react"
import { useLocation } from "react-router-dom"
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
  Bell,
  CheckCheck,
  AlertCircle,
  FileCheck,
  Package,
  ArrowRight,
  Clock,
} from "lucide-react"

interface NotificationItem {
  id: string
  title: string
  description: string
  time: string
  unread: boolean
  type: "order" | "report" | "stock" | "manufacturing"
}

const mockNotifications: Record<string, NotificationItem[]> = {
  "/selling": [
    {
      id: "s1",
      title: "Yeni Satış Siparişi",
      description: "Raymond firması SAL-ORD-2025-0039 numaralı siparişi onayladı.",
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
      description: "Müşteri satın alma siparişi için avans ödemesi oluşturuldu.",
      time: "3 saat önce",
      unread: false,
      type: "order",
    },
  ],
  "/accounting": [
    {
      id: "a1",
      title: "Bilanço Raporu Güncellendi",
      description: "Consolidated Financial Report için dönemsel kapanış girdisi işlendi.",
      time: "5 dakika önce",
      unread: true,
      type: "report",
    },
    {
      id: "a2",
      title: "Kasa/Mizan Uyarısı",
      description: "Customer Ledger üzerinde tutarsızlık tespiti kontrol edildi.",
      time: "2 saat önce",
      unread: true,
      type: "report",
    },
  ],
  "/stock": [
    {
      id: "st1",
      title: "Seri No / İzlenebilirlik Kaydı",
      description: "M4 MacBook Air (M4MCBA0004) stok girişi başarıyla eklendi.",
      time: "15 dakika önce",
      unread: true,
      type: "stock",
    },
    {
      id: "st2",
      title: "Minimum Stok Seviyesi",
      description: "M4 Motherboard (M4MBD0001) stok seviyesi kritiğin altına düştü.",
      time: "4 saat önce",
      unread: true,
      type: "stock",
    },
  ],
  "/manufacturing": [
    {
      id: "m1",
      title: "Otomatik Stok Rezervasyonu",
      description: "Sales Order rezervasyonu için Auto Reserve Stock tetiklendi.",
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

export function WorkspaceNotificationPopover() {
  const { pathname } = useLocation()
  const [notifications, setNotifications] = React.useState<NotificationItem[]>([])

  React.useEffect(() => {
    const activeList = mockNotifications[pathname] || mockNotifications["/selling"]
    setNotifications(activeList)
  }, [pathname])

  const unreadCount = notifications.filter((n) => n.unread).length

  const markAllAsRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, unread: false })))
  }

  const getWorkspaceTitle = () => {
    if (pathname === "/accounting") return "Financial Notifications"
    if (pathname === "/stock") return "Stock Notifications"
    if (pathname === "/manufacturing") return "Manufacturing Notifications"
    return "Subcontracting Notifications"
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <SidebarMenuButton tooltip="Notification" className="text-sidebar-foreground/70 relative">
          <Bell className="size-4" />
          <span>Notification</span>
          {unreadCount > 0 && (
            <Badge variant="destructive" className="ml-auto size-4 p-0 flex items-center justify-center text-[10px] rounded-full group-data-[collapsible=icon]:hidden">
              {unreadCount}
            </Badge>
          )}
        </SidebarMenuButton>
      </PopoverTrigger>
      <PopoverContent side="right" align="start" className="w-80 p-0 shadow-xl rounded-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b p-3 bg-muted/20">
          <div className="flex items-center gap-2">
            <Bell className="size-4 text-primary" />
            <h4 className="text-xs font-semibold">{getWorkspaceTitle()}</h4>
          </div>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-[11px] px-2 text-muted-foreground hover:text-foreground"
              onClick={markAllAsRead}
            >
              <CheckCheck className="size-3.5 mr-1" />
              Tümünü Okundu İşaretle
            </Button>
          )}
        </div>

        {/* Notifications Scroll Area */}
        <ScrollArea className="max-h-80">
          <div className="divide-y">
            {notifications.length === 0 ? (
              <div className="p-6 text-center text-xs text-muted-foreground">
                Bu çalışma alanında bildirim bulunmuyor.
              </div>
            ) : (
              notifications.map((item) => (
                <div
                  key={item.id}
                  className={`p-3 text-xs space-y-1 transition-colors hover:bg-muted/40 ${
                    item.unread ? "bg-primary/5" : ""
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-foreground flex items-center gap-1.5">
                      {item.unread && (
                        <span className="size-1.5 rounded-full bg-primary inline-block" />
                      )}
                      {item.title}
                    </span>
                    <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <Clock className="size-3" />
                      {item.time}
                    </span>
                  </div>
                  <p className="text-muted-foreground text-[11px] leading-relaxed">
                    {item.description}
                  </p>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  )
}
