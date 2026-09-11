import { usePathname, useRouter } from "next/navigation"
import { useTranslations } from "next-intl"

/**
 * RAG arama dizininin kapalı kategori seti (TR veri token'ları, eşleştirme
 * pipeline'ıdır — çevrilmez) → `SearchCats` mesaj anahtarı. Tanımsız
 * kategori (gelecek yeni grup) ham metinle düşer.
 */
export const SEARCH_CATEGORY_KEYS: Record<string, string> = {
  "Katalog": "catalog",
  "İşlemler": "operations",
  "Raporlar": "reports",
  "Ayarlar": "settings",
  "Seri & Parti": "serial_batch",
  "Araçlar": "tools",
}

/**
 * Kategori etiketini aktif locale'e göre çözer; beyan listede olmayan
 * kategori ham metinle döner. Görünen metin için yalnız; `CommandItem
 * value` eşleştirme alanı TR token'ları içerdiğinden çeviri değildir.
 */
export function resolveCategoryLabel(
  category: string,
  t: (key: string) => string,
): string {
  const key = SEARCH_CATEGORY_KEYS[category]
  return key ? t(key) : category
}

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
