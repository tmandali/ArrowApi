/** Soru metninden olası form kriter alanını tespit eder (Şirket Kodu, Depo, Mağaza, Tarih vb.). */
export function inferCriteriaFieldFromQuestion(question?: string): string | undefined {
  if (!question) return undefined;
  const q = question.toLowerCase();
  if (q.includes("şirket") || q.includes("company")) return "CompanyCode";
  if (q.includes("depo") || q.includes("warehouse")) return "WarehouseCode";
  if (q.includes("mağaza") || q.includes("store")) return "StoreCode";
  if (q.includes("tarih") || q.includes("date")) return "Date";
  if (q.includes("dönem") || q.includes("period")) return "Period";
  return undefined;
}

/** Soru veya yönlendirme cümlesi olup olmadığını tespit eder. */
export function isQuestionText(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  return (
    /\?\s*$/m.test(trimmed) ||
    /\?\s*(\n|$)/m.test(trimmed) ||
    /(?:hangi|seçin|devam edelim|hangisi|tercih|seçiniz|onaylıyor musunuz|belirtin)\b/i.test(trimmed)
  );
}

/** Satır veya blok maddesinin bullet/ok ile başlayıp başlamadığını kontrol eder. */
export function isBulletBlock(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  return (
    /^(?:->|[•●\-*→]|\d+\.)(?:\s+|$)/.test(trimmed) ||
    trimmed.includes("\n●") ||
    trimmed.includes("\n•") ||
    trimmed.includes("\n-") ||
    trimmed.includes("\n*") ||
    trimmed.includes("\n→") ||
    trimmed.includes("\n->")
  );
}

/**
 * Ajan metnindeki izole bullet veya ok işaretlerini (örn. "●\nTJ01" veya "->\nTJ01")
 * tek satırda "● TJ01" / "-> TJ01" formatına normalize eder.
 */
export function normalizeChoiceBullets(text: string): string {
  if (!text) return text;
  return text.replace(
    /(^|\n)[ \t]*(->|[•●\-*→]|\d+\.)[ \t]*(?:\r?\n)+[ \t]*([^\r\n•●\-*→]+)/g,
    (_match, prefix, bullet, content) => {
      const trimmedContent = content.trim();
      if (!trimmedContent) return _match;
      return `${prefix}${bullet} ${trimmedContent}`;
    },
  );
}
