import type { WorkspaceId, WorkspaceNavItem, WorkspaceNavSubItem } from "@/types";
import {
  REGISTERED_WORKSPACES,
  getWorkspace,
  getAllWorkspaces,
  getRailWorkspaces,
  workspaceDashboardPathByWorkspace,
  workspaceNameById,
  getWorkspaceForPath,
  getWorkspaceNavForPath,
} from "./workspace-registry";
import { stockNav, stockDashboardPath } from "@/workspaces/stock";
import { accountingNav, accountingDashboardPath } from "@/workspaces/accounting";
import { sellingNav, sellingDashboardPath } from "@/workspaces/selling";
import { manufacturingNav, manufacturingDashboardPath } from "@/workspaces/manufacturing";
import { subcontractingNav, subcontractingDashboardPath } from "@/workspaces/subcontracting";
import { systemNav, systemDashboardPath } from "@/features/system";

export type { WorkspaceId, WorkspaceNavItem, WorkspaceNavSubItem };

export {
  REGISTERED_WORKSPACES,
  getWorkspace,
  getAllWorkspaces,
  getRailWorkspaces,
  workspaceDashboardPathByWorkspace,
  workspaceNameById,
  getWorkspaceForPath,
  getWorkspaceNavForPath,
};

/** Shared workspace dashboard (menu-boxes landing screen). */
export const workspaceDashboardPath = stockDashboardPath;

export {
  stockNav,
  accountingNav,
  accountingNav as financialReportsNav,
  sellingNav,
  manufacturingNav,
  subcontractingNav,
  systemNav,
  stockDashboardPath,
  accountingDashboardPath,
  sellingDashboardPath,
  manufacturingDashboardPath,
  subcontractingDashboardPath,
  systemDashboardPath,
};

export const workspaceNavById: Record<WorkspaceId, WorkspaceNavItem[]> = {
  system: systemNav,
  subcontracting: subcontractingNav,
  selling: sellingNav,
  accounting: accountingNav,
  stock: stockNav,
  manufacturing: manufacturingNav,
};
