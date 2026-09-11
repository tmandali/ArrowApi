import { usePathname, useRouter } from "next/navigation"
import { useTranslations } from "next-intl"

export function useWorkspaceSearchMeta() {
  const pathname = usePathname()
  const t = useTranslations("WorkspaceSearch")

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

  const key =
    workspace === "accounting"
      ? "search_accounting"
      : workspace === "stock"
        ? "search_stock"
        : workspace === "manufacturing"
          ? "search_manufacturing"
          : workspace === "subcontracting"
            ? "search_subcontracting"
            : "search_all"

  const placeholder = t(key)

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
