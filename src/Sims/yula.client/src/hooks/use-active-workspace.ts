import { usePathname } from "next/navigation";
import * as React from "react"
import type { WorkspaceId } from "@/lib/workspace-nav"
import { DOMAIN_WORKSPACE_IDS, getWorkspaceForPath } from "@/lib/workspace-registry"

/**
 * Resolve the workspace id for a pathname.
 * Tek kaynak: registry'deki `getWorkspaceForPath` + `DOMAIN_WORKSPACE_IDS`.
 * Global (workspace'den bağımsız) sayfalar — `/`, `/my`, `/system`,
 * legacy `/user-settings`, `/sign-in` vb. — null döner; o sayfalarda
 * "en son ziyaret edilen" domain workspace korunur.
 */
export function workspaceIdFromPath(pathname: string): WorkspaceId | null {
  const id = getWorkspaceForPath(pathname).id
  return DOMAIN_WORKSPACE_IDS.has(id) ? id : null
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
