import type { LucideIcon } from "lucide-react";
import { REGISTERED_WORKSPACES } from "@/lib/workspace-registry";
import type { WorkspaceId } from "@/types";

/**
 * Workspace kimliğine göre marka ikonu — rail ve karşılama ekranları ortak
 * kullanır. TEK KAYNAK: registry (`REGISTERED_WORKSPACES[*].icon`);
 * harici fallback map'i yok (önceki `WORKSPACE_ICONS` registry ikonlarıydı).
 */
export function workspaceIconFor(workspaceId: string | null): LucideIcon | null {
  if (!workspaceId) return null;
  return REGISTERED_WORKSPACES[workspaceId as WorkspaceId]?.icon ?? null;
}
