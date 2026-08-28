import { usePathname, useRouter } from "next/navigation"

export function useWorkspaceSearchMeta() {
  const pathname = usePathname()

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
  const router = useRouter();
  const navigate = (to: string) => void router.push(to);

  return (url: string) => {
    onOpenChange(false)
    if (url && url !== "#") {
      navigate(url)
    }
  }
}
