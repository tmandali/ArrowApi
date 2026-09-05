import type { WorkspaceDefinition, WorkspaceId, WorkspaceNavItem } from "@/types";
import { stockWorkspace } from "@/workspaces/stock";
import { accountingWorkspace } from "@/workspaces/accounting";
import { sellingWorkspace } from "@/workspaces/selling";
import { manufacturingWorkspace } from "@/workspaces/manufacturing";
import { subcontractingWorkspace } from "@/workspaces/subcontracting";
import { systemWorkspace } from "@/features/system";

/** Tüm tescil edilmiş workspace tanımları */
export const REGISTERED_WORKSPACES: Record<WorkspaceId, WorkspaceDefinition> = {
  stock: stockWorkspace,
  accounting: accountingWorkspace,
  selling: sellingWorkspace,
  manufacturing: manufacturingWorkspace,
  subcontracting: subcontractingWorkspace,
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

/** Sol rail (ikon çubuğu) için workspace listesi */
export function getRailWorkspaces() {
  return [
    { id: stockWorkspace.id, name: stockWorkspace.name, url: stockWorkspace.rootPath, icon: stockWorkspace.icon },
    { id: sellingWorkspace.id, name: sellingWorkspace.name, url: sellingWorkspace.rootPath, icon: sellingWorkspace.icon },
    { id: subcontractingWorkspace.id, name: subcontractingWorkspace.name, url: subcontractingWorkspace.rootPath, icon: subcontractingWorkspace.icon },
    { id: accountingWorkspace.id, name: accountingWorkspace.name, url: accountingWorkspace.rootPath, icon: accountingWorkspace.icon },
    { id: manufacturingWorkspace.id, name: manufacturingWorkspace.name, url: manufacturingWorkspace.rootPath, icon: manufacturingWorkspace.icon },
  ];
}

/** Workspace panolarının rotaları */
export const workspaceDashboardPathByWorkspace: Record<WorkspaceId, string> = {
  system: systemWorkspace.dashboardPath,
  stock: stockWorkspace.dashboardPath,
  accounting: accountingWorkspace.dashboardPath,
  selling: sellingWorkspace.dashboardPath,
  manufacturing: manufacturingWorkspace.dashboardPath,
  subcontracting: subcontractingWorkspace.dashboardPath,
};

/** Workspace ID'ye göre isim haritası */
export const workspaceNameById: Record<WorkspaceId, string> = {
  system: systemWorkspace.name,
  stock: stockWorkspace.name,
  accounting: accountingWorkspace.name,
  selling: sellingWorkspace.name,
  manufacturing: manufacturingWorkspace.name,
  subcontracting: subcontractingWorkspace.name,
};

/**
 * Verilen URL yoluna (pathname) göre ilgili workspace'i tespit eder.
 */
export function getWorkspaceForPath(pathname: string): WorkspaceDefinition {
  if (!pathname || pathname === "/" || pathname.startsWith("/my") || pathname.startsWith("/system") || pathname.startsWith("/user-settings")) {
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
