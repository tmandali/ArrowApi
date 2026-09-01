"use client";

import { usePathname, useRouter } from "next/navigation";
import * as React from "react"
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
import { Bell, CheckCheck, Clock, LoaderCircle, Trash2, X } from "lucide-react"

type DisplayNotification = {
  id: string
  title: string
  description: string
  time: string
  unread: boolean
  type: WorkspaceNotificationType
  href?: string
  source: "pending" | "live"
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
  const pathname = usePathname()
  const router = useRouter();
  const navigate = (
    to: string | number,
    _options?: { replace?: boolean; state?: unknown },
  ) => {
    if (typeof to === "number") {
      if (to < 0) router.back();
      else router.forward();
    } else {
      void router.push(to);
    }
  };

  const [open, setOpen] = React.useState(false)
  const { isMobile, state } = useSidebar()
  const iconCollapsed = !isMobile && state === "collapsed"
  const {
    notifications,
    markAsRead,
    markAllAsRead,
    removeNotification,
    clearRead,
  } = useWorkspaceNotifications()
  const jobs = useActiveJobsStore((s) => s.jobs)
  const key = workspaceKeyFromPath(pathname)
  const pendingJobs = React.useMemo(
    () => selectPendingJobs(jobs, key),
    [jobs, key]
  )

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

    return [...pending, ...live]
  }, [notifications, pendingJobs, key])

  const unreadCount = displayNotifications.filter((n) => n.unread).length
  const readCount = displayNotifications.filter(
    (n) => !n.unread && n.source !== "pending"
  ).length

  const handleMarkAllAsRead = () => {
    markAllAsRead({ workspace: key })
  }

  const handleClearRead = () => {
    clearRead({ workspace: key })
  }

  const handleOpenNotification = (item: DisplayNotification) => {
    if (item.source === "live") {
      markAsRead(item.id)
    }

    if (item.href) {
      setOpen(false)
      navigate(item.href)
    }
  }

  const handleDismissNotification = (
    e: React.MouseEvent,
    item: DisplayNotification
  ) => {
    e.stopPropagation()
    if (item.source === "live") {
      removeNotification(item.id)
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
                <div
                  key={`${item.source}-${item.id}`}
                  className={cn(
                    "group relative flex w-full flex-col gap-1 p-3 text-left text-xs transition-colors hover:bg-muted/40",
                    item.unread && "bg-primary/5",
                    item.href ? "cursor-pointer" : "cursor-default"
                  )}
                  onClick={() => handleOpenNotification(item)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      handleOpenNotification(item)
                    }
                  }}
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
                    <div className="flex shrink-0 items-center gap-1">
                      <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        <Clock className="size-3" />
                        {item.time}
                      </span>
                      {!item.pending ? (
                        <button
                          type="button"
                          title="Bildirimi sil"
                          aria-label="Bildirimi sil"
                          className="rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover:opacity-100"
                          onClick={(e) => handleDismissNotification(e, item)}
                        >
                          <X className="size-3" />
                        </button>
                      ) : null}
                    </div>
                  </div>
                  <p className="line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">
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
