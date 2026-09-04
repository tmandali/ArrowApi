import {
  ALL_WORKSPACE_MENU_ITEMS,
  type WorkspaceMenuItem,
} from "@/features/stock/lib/stock-menu-registry"
import {
  emptyWorkspaceHome,
  isWorkspaceHomePath,
  normalizePath,
  reportExecutionPath,
  unslugifyModule,
  workspaceIdFromPath,
} from "@/lib/workspace-paths"

export interface ShellBreadcrumbSegment {
  label: string
  /** Bağlantılı segment; son (en derin) segment link'siz çizilir. */
  href?: string
  /** Segment bu breakpoint'in altında gizlenir (son segment hariç). */
  hideBelow?: "sm" | "md"
}

function findMenu(url: string): WorkspaceMenuItem | undefined {
  return ALL_WORKSPACE_MENU_ITEMS.find((item) => item.url === url)
}

/**
 * AppHeader sol bölgesi için pathname'den shell breadcrumb "ancestry" segmentleri.
 * Yalnız workspace > module kademesini taşır; sayfa başlığı (ör. "Stock Balance")
 * breadcrumb'da DEĞİL, yüzen page header kartında (PageHeaderTitle) gösterilir.
 * - /stock/stock-balance(/{jobId})  → Stock > Reports
 * - /stock/item                     → Stock > Item
 * - /stock/dashboard                → Stock
 * - / ve workspace kökleri → null (AI ana ekranı kendi sohbet başlığını çizer).
 */
export function deriveShellBreadcrumb(
  pathname?: string | null
): ShellBreadcrumbSegment[] | null {
  if (!pathname) return null
  const clean = normalizePath(pathname)
  if (clean === "/" || clean === "/login") return null
  if (isWorkspaceHomePath(clean)) return null

  const base = reportExecutionPath(clean) ?? clean
  const parts = base.split("/").filter(Boolean)
  if (parts.length === 0) return null

  const workspace =
    emptyWorkspaceHome[workspaceIdFromPath(base)] ?? {
      label: unslugifyModule(parts[0]!),
      url: `/${parts[0]}`,
    }

  const segments: ShellBreadcrumbSegment[] = [
    { label: workspace.label, href: workspace.url, hideBelow: "md" },
  ]

  const moduleBase =
    parts.length >= 2 ? `/${parts[0]}/${parts[1]}` : `/${parts[0]}`
  const menu =
    findMenu(base) ??
    (base !== moduleBase ? findMenu(moduleBase) : undefined)

  if (menu) {
    if (menu.category === "Raporlar") {
      segments.push({ label: "Reports" })
    } else {
      segments.push({ label: menu.title, href: menu.url })
    }
  }

  return segments
}
