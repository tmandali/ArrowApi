/**
 * Turun analizinin HANGİ tablodan üretildiğini bulur — saf modül.
 *
 * Bulgu tıklamaları tıklama anındaki aktif view'a değil, analizin yapıldığı
 * tabloya gitmelidir. En güvenilir sinyal, turdaki run_expert_sql
 * çağrılarının FROM yan tümceleridir (somut tablo adları: report_xxx,
 * view_xxx). `active_view` zamana bağlıdır (kullanıcı view değiştirmiş
 * olabilir) — pin olarak kullanılmaz, tarama önceki çağrılara devam eder.
 */
import type { YulaToolPartInfo } from "@/lib/yula-tool-info";

const FROM_RE = /\bfrom\s+"([^"]+)"|\bfrom\s+([A-Za-z_][\w.]*)/i;

function firstConcreteFrom(sql: string): string | null {
  const m = sql.match(FROM_RE);
  if (!m) return null;
  const name = (m[1] ?? m[2] ?? "").trim();
  if (!name || name.toLowerCase() === "active_view") return null;
  return name;
}

/**
 * Sondan başa tarar: son somut FROM kazanır. Yalnızca active_view
 * kullanıldıysa (veya SQL yoksa) null döner — o zaman mevcut davranış
 * (aktif view) korunur.
 */
export function extractSourceTable(
  toolParts: YulaToolPartInfo[],
): string | null {
  for (let i = toolParts.length - 1; i >= 0; i--) {
    const info = toolParts[i];
    if (info.toolName !== "run_expert_sql") continue;
    const input = info.input as { sql?: unknown } | undefined;
    if (typeof input?.sql !== "string") continue;
    const table = firstConcreteFrom(input.sql);
    if (table) return table;
  }
  return null;
}
