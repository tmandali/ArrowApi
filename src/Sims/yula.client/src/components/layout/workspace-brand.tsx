import type { LucideIcon } from "lucide-react"
import {
  BarChart2Icon,
  FactoryIcon,
  PackageIcon,
  RefreshCwIcon,
} from "lucide-react"

/** Workspace kimliğine göre marka ikonu — rail ve karşılama ekranları ortak kullanır. */
export const WORKSPACE_ICONS: Record<string, LucideIcon> = {
  stock: PackageIcon,
  subcontracting: RefreshCwIcon,
  selling: RefreshCwIcon,
  accounting: BarChart2Icon,
  manufacturing: FactoryIcon,
}

export function workspaceIconFor(workspaceId: string | null): LucideIcon | null {
  return workspaceId ? (WORKSPACE_ICONS[workspaceId] ?? null) : null
}
