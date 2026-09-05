import type { LucideIcon } from "lucide-react";
import {
  BarChart2Icon,
  FactoryIcon,
  PackageIcon,
  RefreshCwIcon,
  ShoppingCartIcon,
} from "lucide-react";
import { REGISTERED_WORKSPACES } from "@/lib/workspace-registry";
import type { WorkspaceId } from "@/types";

/** Workspace kimliğine göre marka ikonu — rail ve karşılama ekranları ortak kullanır. */
export const WORKSPACE_ICONS: Record<string, LucideIcon> = {
  stock: PackageIcon,
  subcontracting: RefreshCwIcon,
  selling: ShoppingCartIcon,
  accounting: BarChart2Icon,
  manufacturing: FactoryIcon,
};

export function workspaceIconFor(workspaceId: string | null): LucideIcon | null {
  if (!workspaceId) return null;
  const fromRegistry = REGISTERED_WORKSPACES[workspaceId as WorkspaceId]?.icon;
  return fromRegistry ?? WORKSPACE_ICONS[workspaceId] ?? null;
}
