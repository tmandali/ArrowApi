/**
 * Aktif ekranın rapor kapsamını dinamik olarak çözer.
 * Eğer araç çağrısında explicit scope verilmemişse:
 * 1. Aktif ekran grid/screen mağazası (screen?.reportScope)
 * 2. Tarayıcı URL yolu (REGISTERED_REPORTS eşleşmesi)
 * kontrollerini yaparak ekrandaki aktif raporu bulur.
 */
export async function resolveCurrentReportScope(explicit?: unknown): Promise<string> {
  const explicitStr = typeof explicit === "string" ? explicit.trim().toLowerCase() : "";
  if (explicitStr) return explicitStr;

  try {
    const { useYulaGridStore } = await import("@/lib/stores/grid");
    const screenScope = useYulaGridStore.getState().screen?.reportScope;
    if (screenScope) return screenScope.trim().toLowerCase();
  } catch {}

  if (typeof window !== "undefined") {
    try {
      const currentPath = window.location.pathname;
      const { REGISTERED_REPORTS } = await import("@/features/reports/report-registry");
      const matched = REGISTERED_REPORTS.find((r) => currentPath.startsWith(r.pagePath));
      if (matched) return matched.scope.toLowerCase();
    } catch {}
  }

  return "";
}
