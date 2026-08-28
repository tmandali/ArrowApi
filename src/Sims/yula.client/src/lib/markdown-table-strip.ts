/**
 * Markdown tablo temizleyici — saf modül.
 *
 * Model, ToolResultTable'da zaten gösterilen satırları kendi metnine
 * markdown tablo olarak tekrar yazma eğiliminde (küçük modellerde yaygın;
 * prompt kuralıyla engellenemez). Aynı mesajda run_expert_sql kartı varken
 * metindeki tablo blokları bu fonksiyonla temizlenir; düz metin/başlıklar
 * korunur. Kod blokları (``` ) içindeki satırlara dokunulmaz.
 */

const TABLE_LINE_RE = /^\s*\|/;

export function stripMarkdownTables(text: string): string {
  if (!text.includes("|")) return text;

  const lines = text.split("\n");
  const out: string[] = [];
  let inTable = false;
  let inFence = false;

  for (const line of lines) {
    if (/^\s*```/.test(line)) {
      // Kod bloğu sınırı: tablo temizliği yapma
      if (inFence) {
        inFence = false;
        inTable = false;
        out.push(line);
        continue;
      }
      inFence = true;
      inTable = false;
      out.push(line);
      continue;
    }
    if (inFence) {
      out.push(line);
      continue;
    }
    if (TABLE_LINE_RE.test(line)) {
      inTable = true;
      continue;
    }
    if (inTable && line.trim() === "") {
      // Tablodan hemen sonraki boş satırı da yut (çift boşluk birikmesin)
      continue;
    }
    inTable = false;
    out.push(line);
  }

  return out
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
