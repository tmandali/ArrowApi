"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { getWorkspaceNavForPath } from "@/lib/workspace-registry";
import { useNavTitleLocalizer } from "@/components/layout/module-nav-menu";
import { cn } from "@/utils/cn";

const rowClass =
  "flex min-w-0 items-center rounded-md px-2 py-1.5 text-xs transition-colors"
const rowStyleClass = "text-muted-foreground hover:bg-muted hover:text-foreground"
const rowActiveClass = "bg-primary/10 text-primary font-medium"

/**
 * Rapor sayfalarının BAĞIMSIZ pane içeriği (ModuleNavPane.paneContent):
 * aktif workspace'in nav beyanındaki rapor gruplarını ve alt raporları
 * listeler — ana nav menüden AYRI, sayfa header trigger'ı ile açılan
 * kendi kontrolüne sahiptir.
 *
 * Grup seçimi: mevcut sayfa bir grubun alt öğesi ise o grup; değilse
 * workspace'in ilk rapor (alt öğeli) grubu.
 */
export function ReportListPane() {
  const pathname = usePathname()
  const localizedTitle = useNavTitleLocalizer(pathname)
  const nav = getWorkspaceNavForPath(pathname)
  const groups = nav.filter((item) => item.items && item.items.length > 0)

  const activeGroup =
    groups.find((group) =>
      group.items?.some((subItem) => subItem.url === pathname)
    ) ?? groups[0]

  if (!activeGroup) return null

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-1.5">
      <p className="px-2 pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
        {localizedTitle(activeGroup.url, activeGroup.title)}
      </p>
      <div className="flex flex-col gap-0.5">
        {activeGroup.items?.map((subItem) => {
          const isActive = subItem.url === pathname
          return (
            <Link
              key={subItem.url}
              href={subItem.url}
              className={cn(rowClass, isActive ? rowActiveClass : rowStyleClass)}
            >
              <span className="truncate">
                {localizedTitle(subItem.url, subItem.title)}
              </span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
