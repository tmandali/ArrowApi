"use client";

import Link from "next/link"
import { usePathname } from "next/navigation"
import { ChevronRight } from "lucide-react"
import { useTranslations } from "next-intl"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { getWorkspaceNavForPath } from "@/lib/workspace-nav"
import { cn } from "@/utils/cn"

/**
 * Sistem workspace nav URL'leri → `SystemNav` mesaj anahtarı. Yalnız
 * sistem menü öğeleri lokalize edilir; workspace (ERP domain terimleri)
 * öğeleri veri metinleriyle aynen kalır.
 */
const SYSTEM_NAV_KEYS: Record<string, string> = {
  "/": "home",
  "/my/settings": "my_settings",
  "/system/users": "system_users",
  "/system/agents": "system_agents",
  "/system/skills": "system_skills",
}

const rowClass =
  "flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors"
const rowStyleClass = "text-muted-foreground hover:bg-muted hover:text-foreground"
const rowActiveClass = "bg-primary/10 text-primary font-medium"

export type ModuleNavMenuProps = {
  /**
   * @deprecated Menüyü kapat butonu kaldırıldı — yoksayılır, geriye uyumluluk için tutulur.
   */
  headerVisible?: boolean
  className?: string
}

/**
 * Aktif modülün nav menüsü (workspace switcher yok) — Executions ekranının
 * solundaki panelde render edilir. Veri kaynağı workspace-nav (eski sidebar
 * menü verisi); seçili item vurgusu yapılır, gruplar aktif sayfa
 * içeriyorsa açılır.
 */
export function ModuleNavMenu({
  className,
}: ModuleNavMenuProps = {}) {
  const pathname = usePathname()
  const items = getWorkspaceNavForPath(pathname)
  const tNav = useTranslations("SystemNav")

  /** Sistem URL'leri mesaj kataloğundan çözülür; diğerleri veri metniyle kalır. */
  const localizedTitle = (url: string, fallback: string): string => {
    const key = SYSTEM_NAV_KEYS[url]
    return key ? tNav(key) : fallback
  }

  return (
    <section className={cn("flex h-full min-w-0 flex-col", className)}>
      <nav
        className={cn(
          "flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto overscroll-contain p-1.5"
        )}
        aria-label="Module menu"
      >
        {items.map((item) => {
          const Icon = item.icon
          const hasChildren = Boolean(item.items && item.items.length > 0)
          const isChildActive = item.items?.some(
            (subItem) => subItem.url === pathname
          )

          if (!hasChildren) {
            const isActive = item.url === pathname
            return (
              <Link
                key={item.url}
                href={item.url}
                className={cn(rowClass, isActive ? rowActiveClass : rowStyleClass)}
              >
                <Icon className="size-3.5 shrink-0" aria-hidden />
                <span className="truncate">{localizedTitle(item.url, item.title)}</span>
              </Link>
            )
          }

          return (
            <Collapsible
              key={item.url}
              defaultOpen={Boolean(isChildActive)}
              className="group/nav-item"
            >
              <CollapsibleTrigger className={cn(rowClass, "w-full", rowStyleClass)}>
                <Icon className="size-3.5 shrink-0" aria-hidden />
                <span className="min-w-0 truncate text-left">{localizedTitle(item.url, item.title)}</span>
                <ChevronRight
                  className="ml-auto size-3.5 shrink-0 transition-transform duration-200 group-data-[state=open]/nav-item:rotate-90"
                  aria-hidden
                />
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="mt-0.5 flex flex-col gap-0.5 border-l border-border/60 pl-4">
                  {item.items?.map((subItem) => {
                    const isActive = subItem.url === pathname
                    return (
                      <Link
                        key={subItem.url}
                        href={subItem.url}
                        className={cn(rowClass, "py-1", isActive ? rowActiveClass : rowStyleClass)}
                      >
                        <span className="truncate">{localizedTitle(subItem.url, subItem.title)}</span>
                      </Link>
                    )
                  })}
                </div>
              </CollapsibleContent>
            </Collapsible>
          )
        })}
      </nav>
    </section>
  )
}
