import type { ReactNode } from "react"

import { cn } from "@/utils/cn"

/**
 * Yüzen page-header kartındaki sayfa başlığı metni (eski breadcrumb'ın
 * aktif sayfa yaprağının yerine geçer; shell breadcrumb AppHeader'dadır).
 * Marka turuncusu (app-geneli `--yula-accent` token'ı) ile çizilir.
 */
export function PageHeaderTitle({
  children,
  className,
  title,
}: {
  children: ReactNode
  className?: string
  /** Native hover başlığı (uzun başlıklar için ipucu). */
  title?: string
}) {
  return (
    <span
      title={title}
      className={cn(
        "block min-w-0 truncate font-semibold text-yula-accent",
        className
      )}
    >
      {children}
    </span>
  )
}
