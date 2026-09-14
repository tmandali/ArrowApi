import { usePathname } from "next/navigation";
import type { WorkspaceId } from "@/lib/workspace-nav";
import { DOMAIN_WORKSPACE_IDS, getWorkspaceForPath } from "@/lib/workspace-registry";

/**
 * Resolve the workspace id for a pathname.
 * Tek kaynak: registry'deki `getWorkspaceForPath` + `DOMAIN_WORKSPACE_IDS`.
 * Global (workspace'den bağımsız) sayfalar — `/`, `/my`, `/system`,
 * legacy `/user-settings`, `/sign-in` vb. — null döner.
 */
export function workspaceIdFromPath(pathname?: string | null): WorkspaceId | null {
  if (!pathname) return null;
  const id = getWorkspaceForPath(pathname).id;
  return DOMAIN_WORKSPACE_IDS.has(id) ? id : null;
}

/**
 * Aktif domain workspace kimliği.
 * Sayfa bir domain workspace rotasında olduğunda o workspace kimliğini döner;
 * ana sayfa (/) ve sistem rotalarında ise null döner.
 */
export function useActiveWorkspaceId(): WorkspaceId | null {
  const pathname = usePathname();
  return workspaceIdFromPath(pathname);
}
