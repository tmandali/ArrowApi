import type { WorkspaceRouteConfig } from "@/lib/workspace-route"
import LandedCostVoucherPage from "@/pages/LandedCostVoucherPage"

export const landedCostRoutes: WorkspaceRouteConfig[] = [
  {
    path: "landed-cost-voucher",
    Component: LandedCostVoucherPage,
  },
]
