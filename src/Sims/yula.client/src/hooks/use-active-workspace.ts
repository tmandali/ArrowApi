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
    pathname === "/selling" ||
    pathname.startsWith("/selling/")
  ) {
    return "selling"
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
  const lastWorkspaceRef = React.useRef<WorkspaceId>(DEFAULT_WORKSPACE)

  const active = React.useMemo(() => {
    const id = workspaceIdFromPath(pathname)
    if (id) {
      lastWorkspaceRef.current = id
      return id
    }
    return lastWorkspaceRef.current
  }, [pathname])

  return active
}
