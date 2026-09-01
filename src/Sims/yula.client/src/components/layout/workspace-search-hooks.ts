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
      ? "Muhasebe & Finans modülleri ve sohbet geçmişinde ara..."
      : workspace === "stock"
        ? "Stock modülleri ve sohbet geçmişinde ara..."
        : workspace === "manufacturing"
          ? "Manufacturing & BOM modülleri ve sohbet geçmişinde ara..."
          : workspace === "subcontracting"
            ? "Fason & Satış modülleri ve sohbet geçmişinde ara..."
            : "Modül, rapor ve sohbet geçmişinde ara..."

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
