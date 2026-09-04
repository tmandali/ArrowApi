import { usePathname } from "next/navigation";
import * as React from "react"
import type { WorkspaceId } from "@/lib/workspace-nav"

/**
 * Resolve the workspace id for a pathname.
 * Returns null for global (workspace-independent) pages such as /user-settings,
 * /dashboard, /login — those should keep the previously active workspace.
 */
export function workspaceIdFromPath(pathname: string): WorkspaceId | null {
  if (
    pathname === "/" ||
    pathname.startsWith("/my") ||
    pathname === "/user-settings" ||
    pathname.startsWith("/system/") ||
    pathname === "/system"
  ) {
    return null
  }
  if (
    pathname === "/stock" ||
    pathname.startsWith("/stock/") ||
    pathname === "/landed-cost-voucher"
  ) {
    return "stock"
  }
  if (
    pathname === "/accounting" ||
    pathname.startsWith("/accounting/")
  ) {
    return "accounting"
  }
  if (
    pathname === "/manufacturing" ||
    pathname.startsWith("/manufacturing/")
  ) {
    return "manufacturing"
  }
  if (
    pathname === "/subcontracting" ||
    pathname.startsWith("/subcontracting/") ||
    pathname === "/selling" ||
    pathname.startsWith("/selling/")
  ) {
    return "subcontracting"
  }
  return null
}

/**
 * Active workspace based on the current path, or null on global pages
 * (pathname without a workspace prefix) before any workspace has been
 * visited — the rail then highlights nothing instead of a default one.
 * After a workspace has been visited, the last one is preserved on global pages.
 */
export function useActiveWorkspaceId(): WorkspaceId | null {
  const pathname = usePathname()
  const [lastWorkspace, setLastWorkspace] =
    React.useState<WorkspaceId | null>(null)
  const [prevPathname, setPrevPathname] = React.useState(pathname)

  const id = workspaceIdFromPath(pathname)
  // Pathname değişince en son ziyaret edilen workspace'i güncelle —
  // React'ın "render sırasında state ayarlama" kalıbı (ref yerine state).
  if (prevPathname !== pathname) {
    setPrevPathname(pathname)
    if (id) setLastWorkspace(id)
  }

  return id ?? lastWorkspace
}
