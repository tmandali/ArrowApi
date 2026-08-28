import { usePathname, useRouter } from "next/navigation"

export function useWorkspaceSearchMeta() {
  const pathname = usePathname()

  const workspace =
    pathname.startsWith("/accounting") || pathname.startsWith("/financial-reports")
      ? "accounting"
      : pathname.startsWith("/stock") || pathname === "/landed-cost-voucher"
        ? "stock"
        : pathname.startsWith("/manufacturing")
          ? "manufacturing"
          : pathname.startsWith("/subcontracting") || pathname.startsWith("/selling")
            ? "subcontracting"
            : "all"

  const placeholder =
    workspace === "accounting"
      ? "Accounting & Finans modüllerinde ara..."
      : workspace === "stock"
        ? "Stock & İzlenebilirlik modüllerinde ara..."
        : workspace === "manufacturing"
          ? "Manufacturing & BOM modüllerinde ara..."
          : workspace === "subcontracting"
            ? "Subcontracting & Fason modüllerinde ara..."
            : "Tüm modül ve raporlarda ara..."

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
