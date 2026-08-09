import type { WorkspaceRouteConfig } from "@/lib/workspace-route"
import SellingPage from "@/pages/SellingPage"

export const sellingRoutes: WorkspaceRouteConfig[] = [
  {
    path: "selling/sales-order",
    Component: SellingPage,
  },
]
