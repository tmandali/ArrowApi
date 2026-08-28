/**
 * Rapor çalıştırma otobüsü: kriter ekranı sahibi (örn. StockModuleShell) aktif raporun
 * "Çalıştır" akışını buraya kaydeder; jenerik run_report aracı bunu tetikler.
 * Böylece rapor başına araç yazmak yerine TEK jenerik araç yeterlidir.
 */

const runners = new Map<string, () => void>();

function norm(scope: string): string {
  return String(scope || "").trim().toLowerCase().replace(/-/g, "_");
}

export function registerReportRunner(
  scope: string,
  fn: () => void
): () => void {
  const key = norm(scope);
  runners.set(key, fn);
  return () => {
    const cur = runners.get(key);
    if (cur === fn) runners.delete(key);
  };
}

/** Çalıştırıcı yoksa false döner — aracı hata mesajıyla yanıtlamak için. */
export function triggerReportRun(scope: string): boolean {
  const fn = runners.get(norm(scope));
  if (!fn) return false;
  fn();
  return true;
}
