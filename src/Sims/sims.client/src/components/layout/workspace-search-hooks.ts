import { useLocation, useNavigate } from "react-router-dom"

export function useWorkspaceSearchMeta() {
  const { pathname } = useLocation()

  const workspace =
    pathname.startsWith("/accounting")
      ? "accounting"
      : pathname.startsWith("/stock") || pathname === "/landed-cost-voucher"
        ? "stock"
        : pathname.startsWith("/manufacturing")
          ? "manufacturing"
          : "selling"

  const placeholder =
    workspace === "accounting"
      ? "Search Financial Reports..."
      : workspace === "stock"
        ? "Search Stock & Traceability..."
        : workspace === "manufacturing"
          ? "Search Manufacturing & BOM..."
          : "Search Subcontracting & Orders..."

  return { workspace, placeholder }
}

export function useWorkspaceSearchNavigate(
  onOpenChange: (open: boolean) => void
) {
  const navigate = useNavigate()

  return (url: string) => {
    onOpenChange(false)
    if (url && url !== "#") {
      navigate(url)
    }
  }
}
