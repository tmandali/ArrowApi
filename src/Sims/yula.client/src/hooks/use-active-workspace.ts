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

const DEFAULT_WORKSPACE: WorkspaceId = "stock"

/**
 * Active workspace based on the current path.
 * On global pages (pathname without a workspace prefix) the last visited
 * workspace is preserved instead of falling back to a default one.
 */
export function useActiveWorkspaceId(): WorkspaceId {
  const pathname = usePathname()
  const [lastWorkspace, setLastWorkspace] =
    React.useState<WorkspaceId>(DEFAULT_WORKSPACE)
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
