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
  const column = matchColumn(text, input.columns);
  if (!column) return null;

  // 1. Boş / Eksik / NULL değerler
  if (/(?:boş|bos|null|tanımsız|tanimsiz|eksik)/i.test(text)) {
    return `${column} kolonunda boş olanları filtrele`;
  }

  // 2. Negatif değerler
  if (/(?:negatif|eksi)/i.test(text)) {
    return `${column} kolonunu <0 olacak şekilde filtrele`;
  }

  // 3. Karşılaştırma Operatörleri: < 0, <= 10, > 50, = 0
  const opMatch = text.match(/([<>]=?|=)\s*(\d+(?:[.,]\d+)?)/);
  if (opMatch) {
    const op = opMatch[1];
    const n = normalizeNumber(opMatch[2]);
    return `${column} ${op} ${n} olan kayıtları filtrele`;
  }

  // 4. Aralık: "0.5 - 40.5 arası" · "1..100" · "10 ile 20"
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

  // 5. Eşik-az: "1'den küçük", "0 altında", "5'ten az"
  const less = text.match(
    /(\d+(?:[.,]\d+)?)\s*'?(?:den|dan|ten|tan)?\s*(?:küçük|kucuk|az|düşük|dusuk|altında|altinda)/i,
  );
  if (less) {
    const n = normalizeNumber(less[1]);
    return `${column} kolonunu ${n}'den küçük olacak şekilde filtrele`;
  }

  // 6. Eşik-çok: "500 üzeri", "1000 üstü"
  const more = text.match(
    /(\d+(?:[.,]\d+)?)\s*'?\s*(?:üzeri|uzeri|üstü|ustu|üstünde|ustunde)/i,
  );
  if (more) {
    const n = normalizeNumber(more[1]);
    return `${column} kolonunu ${n} üzeri olacak şekilde filtrele`;
  }

  // 7. Sıfır / 0 olanlar
  if (/(?:sıfır|sifir|0\s*olan)/i.test(text)) {
    return `${column} = 0 olan kayıtları filtrele`;
  }

  return `${column} ile ilgili kayıtları filtrele`;
}
