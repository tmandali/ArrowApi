/**
 * Analiz bulgusu metninden uygulanabilir filtre prompt'u çıkarıcı — saf modül.
 *
 * Modelin bulgu maddeleri ("Kritik Stok Seviyeleri (Qty): 0.5 - 40.5 arası...")
 * tıklanabilir olduğunda "X hazırla" yerine gerçek bir grid filtresi tetikleyen
 * prompt üretir. Kelime-listesi yasak: kolon adları açık grid şemasından gelir,
 * sayı/aralık desenleri yapısaldır.
 */

export interface FindingFilterInput {
  /** Bulgu başlığı + açıklaması birleşik metin */
  text: string;
  /** Açık grid kolonları (useYulaGridStore.spec.columns) */
  columns: string[];
}

/** Birleştirilmiş metinde geçen gerçek grid kolonunu bulur (büyük/küçük duyarsız). */
function matchColumn(text: string, columns: string[]): string | null {
  const lower = text.toLowerCase();
  for (const col of columns) {
    if (col.length >= 2 && lower.includes(col.toLowerCase())) return col;
  }
  return null;
}

/** "0,5" → "0.5" (D365 ondalık nokta kullanır) */
function normalizeNumber(s: string): string {
  return s.replace(",", ".");
}

/**
 * Bulgu metninden filtre prompt'u üretir; çıkarılamıyorsa null döner.
 * Desteklenen desenler: aralık ("0.5 - 40.5 arası", "1..100"), eşik
 * ("1'den küçük", "500 üzeri"), tek değer ("=0" benzeri tam eşitlik yok).
 */
export function extractFindingFilterPrompt(
  input: FindingFilterInput,
): string | null {
  const text = input.text.replace(/\*\*/g, " ").replace(/\s+/g, " ");

  // 1. Açıklamada veya başlıkta doğrudan geçerli bir SQL sorgusu varsa (SELECT ... FROM ...)
  const sqlMatch = text.match(/select\s+[\s\S]+?\s+from\s+[\w.]+/i);
  if (sqlMatch) {
    return `/sorgu ${sqlMatch[0].trim()}`;
  }

  const column = matchColumn(text, input.columns);

  // 2. Mükerrer / Çift / Duplicate Kayıtlar (Büyük sorgu: GROUP BY ... HAVING COUNT(*) > 1)
  if (/(?:mükerrer|mukerrer|tekrar\s*eden|duplicate|çift\s*kayıt)/i.test(text)) {
    const colName = column || input.columns[0] || "anahtar";
    return `${colName} kolonuna göre mükerrer kayıtları gruplayarak grid tablosunda göster`;
  }

  // 3. Gruplama & Özet Dağılım Sorguları (Büyük sorgu: GROUP BY ... SUM / AVG)
  if (/(?:grupla|bazında|dağılım|ozet|özet|toplam\s*tutar|segment)/i.test(text)) {
    const colName = column || input.columns[0];
    return colName
      ? `${colName} bazında gruplayarak özet sonuçları grid tablosunda göster`
      : `Veri analizi sonuçlarını gruplayarak grid tablosunda göster`;
  }

  if (!column) return null;

  // 4. Boş / Eksik / NULL değerler
  if (/(?:boş|bos|null|tanımsız|tanimsiz|eksik)/i.test(text)) {
    return `${column} kolonunda boş olanları filtrele`;
  }

  // 5. Negatif değerler
  if (/(?:negatif|eksi)/i.test(text)) {
    return `${column} kolonunu <0 olacak şekilde filtrele`;
  }

  // 6. Karşılaştırma Operatörleri: < 0, <= 10, > 50, = 0
  const opMatch = text.match(/([<>]=?|=)\s*(\d+(?:[.,]\d+)?)/);
  if (opMatch) {
    const op = opMatch[1];
    const n = normalizeNumber(opMatch[2]);
    return `${column} ${op} ${n} olan kayıtları filtrele`;
  }

  // 7. Aralık: "0.5 - 40.5 arası" · "1..100" · "10 ile 20"
  const range = text.match(
    /(\d+(?:[.,]\d+)?)\s*(?:-|–|—|\.\.|\sile\s)\s*(\d+(?:[.,]\d+)?)/,
  );
  if (range) {
    const a = Number(normalizeNumber(range[1]));
    const b = Number(normalizeNumber(range[2]));
    if (Number.isFinite(a) && Number.isFinite(b)) {
      const [lo, hi] = a <= b ? [a, b] : [b, a];
      return `${column} kolonunu ${lo}..${hi} aralığına filtrele`;
    }
  }

  // 8. Eşik-az: "1'den küçük", "0 altında", "5'ten az"
  const less = text.match(
    /(\d+(?:[.,]\d+)?)\s*'?(?:den|dan|ten|tan)?\s*(?:küçük|kucuk|az|düşük|dusuk|altında|altinda)/i,
  );
  if (less) {
    const n = normalizeNumber(less[1]);
    return `${column} kolonunu ${n}'den küçük olacak şekilde filtrele`;
  }

  // 9. Eşik-çok: "500 üzeri", "1000 üstü"
  const more = text.match(
    /(\d+(?:[.,]\d+)?)\s*'?\s*(?:üzeri|uzeri|üstü|ustu|üstünde|ustunde)/i,
  );
  if (more) {
    const n = normalizeNumber(more[1]);
    return `${column} kolonunu ${n} üzeri olacak şekilde filtrele`;
  }

  // 10. Sıfır / 0 olanlar
  if (/(?:sıfır|sifir|0\s*olan)/i.test(text)) {
    return `${column} = 0 olan kayıtları filtrele`;
  }

  return null;
}

/**
 * "Başlık: açıklama" / "**Başlık:** açıklama" satırını ayırır.
 * Başlık tıklanınca sohbete yalnızca kısa başlık gider (dar panelde uzun kullanıcı balonu olmasın).
 */
export function parseColonTitleLine(line: string): { title: string; desc: string } | null {
  const cleaned = line
    .trim()
    .replace(/^([-*•●]|\d+\.)\s+/, "")
    .replace(/\*\*/g, "")
    .trim();
  const colon = cleaned.indexOf(":");
  if (colon < 3 || colon > 80) return null;
  const title = cleaned.slice(0, colon).trim();
  const desc = cleaned.slice(colon + 1).trim();
  if (title.length < 3 || desc.length < 2) return null;
  if (/^https?:\/\//i.test(title) || /^\d{1,2}$/.test(title)) return null;
  if (title.includes("\n") || desc.length > 800) return null;
  return { title, desc };
}

/** Tıklanınca sohbete yazılacak kısa komut — yalnız başlık. */
export function findingItemPrompt(title: string, _desc?: string): string {
  return title.replace(/:+\s*$/, "").trim();
}
