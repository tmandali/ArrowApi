/**
 * ?yula=<agentId> query yönetimi — Yula'nın sayfa içi (main mode) expand +
 * ajan durumunun F5/doğrudan bağlantıda geri yüklenmesi için.
 * Diğer query parametreleri (jobId vb.) korunur; agentId null'da param
 * temizlenir. replaceState ile yazılır — geçiş sinyali üretmez, tarayıcı
 * geçmişine ek kayıt düşmez.
 */
export function applyYulaAgentQuery(agentId: string | null) {
  if (typeof window === "undefined") return
  const url = new URL(window.location.href)
  if (agentId) url.searchParams.set("yula", agentId)
  else url.searchParams.delete("yula")
  window.history.replaceState(window.history.state, "", url)
}

/** Mevcut URL'deki ?yula= değeri (yoksa null) — mount'ta durum onarımı. */
export function readYulaAgentQuery(): string | null {
  if (typeof window === "undefined") return null
  return new URLSearchParams(window.location.search).get("yula")
}
