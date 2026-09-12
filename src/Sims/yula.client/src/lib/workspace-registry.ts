import type { WorkspaceDefinition, WorkspaceId, WorkspaceNavItem } from "@/types";
import { stockWorkspace } from "@/workspaces/stock";
import { accountingWorkspace } from "@/workspaces/accounting";
import { sellingWorkspace } from "@/workspaces/selling";
import { manufacturingWorkspace } from "@/workspaces/manufacturing";
import { subcontractingWorkspace } from "@/workspaces/subcontracting";
import { myWorkspace } from "@/workspaces/my";
import { systemWorkspace } from "@/features/system";

/** Tüm tescil edilmiş workspace tanımları */
export const REGISTERED_WORKSPACES: Record<WorkspaceId, WorkspaceDefinition> = {
  stock: stockWorkspace,
  accounting: accountingWorkspace,
  selling: sellingWorkspace,
  manufacturing: manufacturingWorkspace,
  subcontracting: subcontractingWorkspace,
  my: myWorkspace,
  system: systemWorkspace,
};

/** Belirli bir workspace tanımını döndürür */
export function getWorkspace(id: WorkspaceId): WorkspaceDefinition {
  return REGISTERED_WORKSPACES[id] ?? systemWorkspace;
}

/** Tescilli tüm workspace listesi */
export function getAllWorkspaces(): WorkspaceDefinition[] {
  return Object.values(REGISTERED_WORKSPACES);
}

/**
 * "Domain" (iş alanı) workspace'ler — sol rail ve "active workspace" kavramı
 * yalnız bunlarda anlamlıdır. `system` (platform) ve `my` (kişisel, rail'de
 * declare edilmez) active-workspace takibine girmez. Sıralama = rail sırası.
 */
export const DOMAIN_WORKSPACE_IDS: ReadonlySet<WorkspaceId> = new Set([
  "stock",
  "selling",
  "subcontracting",
  "accounting",
  "manufacturing",
]);

/** Sol rail (ikon çubuğu) için workspace listesi — DOMAIN_WORKSPACE_IDS tek kaynağı. */
export function getRailWorkspaces() {
  return Array.from(DOMAIN_WORKSPACE_IDS, (id) => {
    const ws = REGISTERED_WORKSPACES[id];
    return { id: ws.id, name: ws.name, url: ws.rootPath, icon: ws.icon };
  });
}

/** Workspace panolarının rotaları */
export const workspaceDashboardPathByWorkspace: Record<WorkspaceId, string> = {
  system: systemWorkspace.dashboardPath,
  my: myWorkspace.dashboardPath,
  stock: stockWorkspace.dashboardPath,
  accounting: accountingWorkspace.dashboardPath,
  selling: sellingWorkspace.dashboardPath,
  manufacturing: manufacturingWorkspace.dashboardPath,
  subcontracting: subcontractingWorkspace.dashboardPath,
};

/** Workspace ana sayfalarının (root / landing) rotaları */
export const workspaceRootPathByWorkspace: Record<WorkspaceId, string> = {
  system: systemWorkspace.rootPath,
  my: myWorkspace.rootPath,
  stock: stockWorkspace.rootPath,
  accounting: accountingWorkspace.rootPath,
  selling: sellingWorkspace.rootPath,
  manufacturing: manufacturingWorkspace.rootPath,
  subcontracting: subcontractingWorkspace.rootPath,
};

/** Workspace ID'ye göre isim haritası */
export const workspaceNameById: Record<WorkspaceId, string> = {
  system: systemWorkspace.name,
  my: myWorkspace.name,
  stock: stockWorkspace.name,
  accounting: accountingWorkspace.name,
  selling: sellingWorkspace.name,
  manufacturing: manufacturingWorkspace.name,
  subcontracting: subcontractingWorkspace.name,
};

/**
 * Verilen URL yoluna (pathname) göre ilgili workspace'i tespit eder.
 * CANONICAL path→workspace resolver'ıdır; `lib/workspace-paths.ts`'teki
 * `workspaceIdFromPath` / `workspaceLabelFromPath` (düşük katman lib, registry'den
 * import edemez) bu kuralları yineler — ikisi BİRLİKTE güncellenmelidir.
 */
export function getWorkspaceForPath(pathname: string): WorkspaceDefinition {
  // Legacy `/user-settings` → `/my/settings` redirect'i: hedef workspace "my".
  if (pathname?.startsWith("/my") || pathname?.startsWith("/user-settings")) {
    return myWorkspace;
  }
  if (!pathname || pathname === "/" || pathname.startsWith("/system")) {
    return systemWorkspace;
  }
  if (pathname.startsWith("/stock") || pathname === "/landed-cost-voucher") {
    return stockWorkspace;
  }
  if (pathname.startsWith("/accounting") || pathname.startsWith("/financial-reports")) {
    return accountingWorkspace;
  }
  if (pathname.startsWith("/manufacturing")) {
    return manufacturingWorkspace;
  }
  if (pathname.startsWith("/subcontracting")) {
    return subcontractingWorkspace;
  }
  if (pathname.startsWith("/selling")) {
    return sellingWorkspace;
  }
  return systemWorkspace;
}

/**
 * Verilen URL yoluna göre sol navigasyon menüsünü döndürür.
 */
export function getWorkspaceNavForPath(pathname: string): WorkspaceNavItem[] {
  return getWorkspaceForPath(pathname).navigation;
}
