/**
 * Natural Language to Microsoft Dynamics 365 / Business Central Filter Syntax Synthesizer
 * 
 * Doğal dildeki Türkçe/İngilizce filtre isteklerini Business Central / Dynamics 365
 * filtre sözdizimine (BC Expression) dönüştürür.
 * 
 * Örnekler:
 * - "100 ile 500 arası"           ➔ "100..500"
 * - "50000 üzeri" / "en az 50000"  ➔ "50000.."
 * - "1000 altı" / "en fazla 1000" ➔ "..1000"
 * - "Ankara hariç" / "dışındakiler" ➔ "!Ankara"
 * - "Ankara ve İzmir hariç"       ➔ "!Ankara&!İzmir"
 * - "Ankara veya İzmir"           ➔ "Ankara|İzmir"
 * - "SKU ile başlayanlar"         ➔ "SKU*"
 * - "001 ile bitenler"            ➔ "*001"
 * - "sıfır olmayanlar"            ➔ "<>0"
 * - "boş olanlar"                 ➔ "''"
 * - "dolu olanlar"                ➔ "<>''"
 */

export interface SynthesizedFilterResult {
  hasBcFilter: boolean;
  filterExpression: string;
  targetColumnHint?: string;
  explanation: string;
}

const TURKISH_MONTHS: Record<string, { num: string; days: number }> = {
  ocak: { num: "01", days: 31 },
  subat: { num: "02", days: 29 },
  şubat: { num: "02", days: 29 },
  mart: { num: "03", days: 31 },
  nisan: { num: "04", days: 30 },
  mayis: { num: "05", days: 31 },
  mayıs: { num: "05", days: 31 },
  haziran: { num: "06", days: 30 },
  temmuz: { num: "07", days: 31 },
  agustos: { num: "08", days: 31 },
  ağustos: { num: "08", days: 31 },
  eylul: { num: "09", days: 30 },
  eylül: { num: "09", days: 30 },
  ekim: { num: "10", days: 31 },
  kasim: { num: "11", days: 30 },
  kasım: { num: "11", days: 30 },
  aralik: { num: "12", days: 31 },
  aralık: { num: "12", days: 31 },
};

export function synthesizeBcFilter(
  prompt: string,
  _availableColumns: string[] = []
): SynthesizedFilterResult {
  const p = prompt.trim();
  const pLower = p.toLowerCase();
  const now = new Date();
  const currentYear = now.getFullYear();

  // 0.0 Doğrudan ! ile başlayan BC Hariç Tutma Filtreleri (örn: "!SKU-020", "!Ankara", "!0", "!SKU-001&!SKU-002")
  if (/^!/.test(p)) {
    return {
      hasBcFilter: true,
      filterExpression: p,
      explanation: `"${p.replace(/^!+/, "")}" hariç tutuluyor`,
    };
  }

  // 0. Tarih & Ay / Yıl Aralıkları Sentezi (Örn: "2026 ağustos", "2026 yılı", "bu ay", "geçen ay")
  // 0.1 Yıl + Ay (örn: "2026 ağustos", "2026 ağustos ayı", "2026 ağustos ayına ait / it", "ağustos 2026")
  const yearMonthMatch =
    pLower.match(/\b(20\d\d)\s+([a-zçğıöşü]+)/i) ||
    pLower.match(/\b([a-zçğıöşü]+)\s+(20\d\d)/i);
  if (yearMonthMatch) {
    const part1 = yearMonthMatch[1].toLowerCase();
    const part2 = yearMonthMatch[2].toLowerCase();
    const year = /^\d{4}$/.test(part1) ? part1 : part2;
    const monthName = /^\d{4}$/.test(part1) ? part2 : part1;
    const monthInfo = TURKISH_MONTHS[monthName];
    if (monthInfo) {
      const start = `${year}-${monthInfo.num}-01`;
      const end = `${year}-${monthInfo.num}-${String(monthInfo.days).padStart(2, "0")}`;
      return {
        hasBcFilter: true,
        filterExpression: `${start}..${end}`,
        targetColumnHint: "date",
        explanation: `${year} ${monthName.toUpperCase()} ayı kayıtları (${start}..${end}) süzülüyor`,
      };
    }
  }

  // 0.2 Sadece Ay Adı (örn: "ağustos ayı", "ağustos ayına ait", "mart kayıtları")
  for (const [mName, mInfo] of Object.entries(TURKISH_MONTHS)) {
    if (pLower.includes(mName) && (pLower.includes("ay") || pLower.includes("kayıt") || pLower.includes("süz") || pLower.includes("göster") || pLower.includes("listele"))) {
      const start = `${currentYear}-${mInfo.num}-01`;
      const end = `${currentYear}-${mInfo.num}-${String(mInfo.days).padStart(2, "0")}`;
      return {
        hasBcFilter: true,
        filterExpression: `${start}..${end}`,
        targetColumnHint: "date",
        explanation: `${currentYear} ${mName.toUpperCase()} ayı kayıtları (${start}..${end}) süzülüyor`,
      };
    }
  }

  // 0.3 Yıl (örn: "2026 yılı", "2026 yılına ait", "2025 senesi")
  const yearOnlyMatch = pLower.match(/\b(20\d\d)\s*(?:yılı|senesi|yılına|senesine|senesindeki|yılındaki)\b/i);
  if (yearOnlyMatch) {
    const year = yearOnlyMatch[1];
    return {
      hasBcFilter: true,
      filterExpression: `${year}-01-01..${year}-12-31`,
      targetColumnHint: "date",
      explanation: `${year} yılı (${year}-01-01..${year}-12-31) süzülüyor`,
    };
  }

  // 0.4 Göreceli Tarihler (Yazım Hatalarına ve Eksik Yazımlara Dayanıklı: "geç ay", "gec ay", "geçen ay", "bu ay", "bu yıl", "bugün", "dün")
  // 0.4.1 Geçen Ay / Önceki Ay / Geç Ay
  if (/\b(ge[çc]en\s*ay|ge[çc]\s*ay|ge[çc]en\s*ay[ıi]n|ö?o?nceki\s*ay|son\s*ay)\b/i.test(pLower)) {
    const prevDate = new Date(currentYear, now.getMonth() - 1, 1);
    const prevYear = prevDate.getFullYear();
    const prevM = String(prevDate.getMonth() + 1).padStart(2, "0");
    const lastDay = new Date(prevYear, prevDate.getMonth() + 1, 0).getDate();
    return {
      hasBcFilter: true,
      filterExpression: `${prevYear}-${prevM}-01..${prevYear}-${prevM}-${lastDay}`,
      targetColumnHint: "date",
      explanation: `Geçen ayın kayıtları (${prevYear}-${prevM}-01..${prevYear}-${prevM}-${lastDay}) süzülüyor`,
    };
  }

  // 0.4.2 Bu Ay / Şimdiki Ay / Mevcut Ay
  if (/\b(bu\s*ay|bu\s*ay[ıi]n|bu\s*aydaki|mevcut\s*ay|ş?s?imdiki\s*ay)\b/i.test(pLower)) {
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const lastDay = new Date(currentYear, now.getMonth() + 1, 0).getDate();
    return {
      hasBcFilter: true,
      filterExpression: `${currentYear}-${m}-01..${currentYear}-${m}-${lastDay}`,
      targetColumnHint: "date",
      explanation: `Bu ayın kayıtları (${currentYear}-${m}-01..${currentYear}-${m}-${lastDay}) süzülüyor`,
    };
  }

  // 0.4.3 Gelecek Ay / Sonraki Ay / Önümüzdeki Ay
  if (/\b(gelecek\s*ay|sonraki\s*ay|ö?o?n[üu]m[üu]zdeki\s*ay)\b/i.test(pLower)) {
    const nextDate = new Date(currentYear, now.getMonth() + 1, 1);
    const nextYear = nextDate.getFullYear();
    const nextM = String(nextDate.getMonth() + 1).padStart(2, "0");
    const lastDay = new Date(nextYear, nextDate.getMonth() + 1, 0).getDate();
    return {
      hasBcFilter: true,
      filterExpression: `${nextYear}-${nextM}-01..${nextYear}-${nextM}-${lastDay}`,
      targetColumnHint: "date",
      explanation: `Gelecek ayın kayıtları (${nextYear}-${nextM}-01..${nextYear}-${nextM}-${lastDay}) süzülüyor`,
    };
  }

  // 0.4.4 Geçen Yıl / Önceki Yıl / Geç Yıl
  if (/\b(ge[çc]en\s*y[ıi]l|ge[çc]\s*y[ıi]l|ge[çc]en\s*sene|ö?o?nceki\s*y[ıi]l)\b/i.test(pLower)) {
    const prevYear = currentYear - 1;
    return {
      hasBcFilter: true,
      filterExpression: `${prevYear}-01-01..${prevYear}-12-31`,
      targetColumnHint: "date",
      explanation: `Geçen yıl (${prevYear}-01-01..${prevYear}-12-31) süzülüyor`,
    };
  }

  // 0.4.5 Bu Yıl / Bu Sene
  if (/\b(bu\s*y[ıi]l|bu\s*sene|bu\s*seneki|bu\s*senenin)\b/i.test(pLower)) {
    return {
      hasBcFilter: true,
      filterExpression: `${currentYear}-01-01..${currentYear}-12-31`,
      targetColumnHint: "date",
      explanation: `Bu yıl (${currentYear}-01-01..${currentYear}-12-31) süzülüyor`,
    };
  }

  // 0.4.6 Bugün / Dün
  if (/\bbug[üu]n\b/i.test(pLower)) {
    const dStr = now.toISOString().slice(0, 10);
    return {
      hasBcFilter: true,
      filterExpression: dStr,
      targetColumnHint: "date",
      explanation: `Bugünün kayıtları (${dStr}) süzülüyor`,
    };
  }
  if (/\bd[üu]n\b/i.test(pLower)) {
    const yesterday = new Date(now.getTime() - 86400000);
    const dStr = yesterday.toISOString().slice(0, 10);
    return {
      hasBcFilter: true,
      filterExpression: dStr,
      targetColumnHint: "date",
      explanation: `Dünün kayıtları (${dStr}) süzülüyor`,
    };
  }

  // 1. Boş / Dolu Filtreleri
  if (/\b(boş olanlar|boşlar|null olanlar|boş değerler)\b/i.test(pLower)) {
    return {
      hasBcFilter: true,
      filterExpression: "''",
      explanation: "Boş (Null) olan kayıtlar süzülüyor",
    };
  }
  if (/\b(dolu olanlar|boş olmayanlar|dolu olan|tanımlı olanlar)\b/i.test(pLower)) {
    return {
      hasBcFilter: true,
      filterExpression: "<>''",
      explanation: "Dolu (Boş olmayan) kayıtlar süzülüyor",
    };
  }

  // 2. Sıfır / Sıfır Olmayan / Stokta Olanlar
  if (/\b(sıfır hariç|sıfırdan farklı|0 olmayan|sıfır olmayan|stokta olanlar|stokta olan|mevcut stok|stok olanlar|stoktakiler)\b/i.test(pLower) || (pLower.includes("stok") && (pLower.includes("olan") || pLower.includes("süz") || pLower.includes("göster")))) {
    return {
      hasBcFilter: true,
      filterExpression: ">0",
      targetColumnHint: "qty",
      explanation: "Stokta mevcut (>0) kayıtlar süzülüyor",
    };
  }
  if (/\b(sıfır olanlar|stokta bitenler|tükenenler|0 olanlar|biten stoklar)\b/i.test(pLower)) {
    return {
      hasBcFilter: true,
      filterExpression: "=0",
      targetColumnHint: "qty",
      explanation: "Sıfıra eşit (=0) kayıtlar süzülüyor",
    };
  }

  // 3. İki Sayı Arası Aralık (Between): "100 ile 500 arası", "100 ila 500", "100 - 500", "8..2026"
  const rangeMatch =
    pLower.match(/(\d+(?:[.,]\d+)?)\s*(?:ile|ila|-|\.\.)\s*(\d+(?:[.,]\d+)?)\s*(?:arasında|arası|aralığında)?/i);
  if (rangeMatch && !pLower.includes("tarih") && !pLower.includes("gün")) {
    const minVal = rangeMatch[1].replace(",", ".");
    const maxVal = rangeMatch[2].replace(",", ".");
    const minNum = parseFloat(minVal);
    const maxNum = parseFloat(maxVal);
    if (!isNaN(minNum) && !isNaN(maxNum)) {
      const low = Math.min(minNum, maxNum);
      const high = Math.max(minNum, maxNum);

      // Ay / Yıl tespiti (Örn: 8..2026 veya 2026..8 -> 2026-08-01..2026-08-31)
      if (low >= 1 && low <= 12 && high >= 2000 && high <= 2099) {
        const monthNum = String(low).padStart(2, "0");
        const daysInMonth = new Date(high, low, 0).getDate();
        return {
          hasBcFilter: true,
          filterExpression: `${high}-${monthNum}-01..${high}-${monthNum}-${daysInMonth}`,
          targetColumnHint: "date",
          explanation: `${high}-${monthNum} ayı kayıtları (${high}-${monthNum}-01..${high}-${monthNum}-${daysInMonth}) süzülüyor`,
        };
      }

      return {
        hasBcFilter: true,
        filterExpression: `${low}..${high}`,
        explanation: `${low} ile ${high} arasındaki değerler süzülüyor`,
      };
    }
  }

  // 4. Doğrudan Karşılaştırma İfadeleri: ">15", ">= 100", "< 50", "<= 20", "<> 0"
  const directOpMatch = pLower.match(/^([<>]=?|<>|!=)\s*(\d+(?:[.,]\d+)?)$/);
  if (directOpMatch) {
    const op = directOpMatch[1] === "!=" ? "<>" : directOpMatch[1];
    const num = directOpMatch[2].replace(",", ".");
    return {
      hasBcFilter: true,
      filterExpression: `${op}${num}`,
      explanation: `${op}${num} değerleri süzülüyor`,
    };
  }

  // 5. Alt Sınır / Büyüktür: "50000 üzeri", "50000\x27den büyük", "en az 50000", ">= 50000"
  const minMatch =
    pLower.match(/(?:en az|minimum|taban)\s*(\d+(?:[.,]\d+)?)/i) ||
    pLower.match(/(\d+(?:[.,]\d+)?)\s*(?:\x27den|\x27dan|den|dan)?\s*(?:büyük|büyükler|fazla|üzeri|üstü|ve üzeri)/i);
  if (minMatch && !pLower.includes("tarih") && !pLower.includes("gün") && !pLower.includes("ay")) {
    const num = minMatch[1].replace(",", ".");
    return {
      hasBcFilter: true,
      filterExpression: `>${num}`,
      explanation: `${num} üzeri değerler süzülüyor`,
    };
  }

  // 6. Üst Sınır / Küçüktür: "1000 altı", "1000\x27den küçük", "en fazla 1000", "maksimum 1000"
  const maxMatch =
    pLower.match(/(?:en fazla|en çok|maksimum|tavan)\s*(\d+(?:[.,]\d+)?)/i) ||
    pLower.match(/(\d+(?:[.,]\d+)?)\s*(?:\x27den|\x27dan|den|dan)?\s*(?:küçük|küçükler|az|altı|ve altı)/i);
  if (maxMatch && !pLower.includes("tarih") && !pLower.includes("gün")) {
    const num = maxMatch[1].replace(",", ".");
    return {
      hasBcFilter: true,
      filterExpression: `<${num}`,
      explanation: `${num} altı değerler süzülüyor`,
    };
  }

  // 6. Çoklu Hariç Tutma (Exclusion): "Ankara ve İzmir hariç", "Ankara ile Bursa dışındakiler"
  const multiExclMatch = p.match(/([a-zA-Z0-9çğıöşüÇĞİÖŞÜ_-]+)\s*(?:ve|ile|,)\s*([a-zA-Z0-9çğıöşüÇĞİÖŞÜ_-]+)\s*(?:hariç|dışında|olmayan)/i);
  if (multiExclMatch) {
    const v1 = multiExclMatch[1].trim();
    const v2 = multiExclMatch[2].trim();
    return {
      hasBcFilter: true,
      filterExpression: `!${v1}&!${v2}`,
      explanation: `${v1} ve ${v2} hariç tutuluyor`,
    };
  }

  // 7. Tekli Hariç Tutma (Exclusion): "Ankara hariç", "SKU-020 hariç", "SKU-001 olmayanlar", "İptal dışındakiler"
  const singleExclMatch = p.match(/([a-zA-Z0-9çğıöşüÇĞİÖŞÜ_-]+)\s*(?:hariç|dışında|olmayanlar|olmayan|dışındakiler)/i);
  if (singleExclMatch) {
    const v = singleExclMatch[1].trim();
    if (!["olan", "bir", "bu", "şu"].includes(v.toLowerCase())) {
      return {
        hasBcFilter: true,
        filterExpression: `!${v}`,
        explanation: `${v} hariç tutuluyor`,
      };
    }
  }

  // 8. VEYA / Çoklu Seçim (OR): "Ankara veya İzmir", "Ankara ya da İzmir", "Ankara | İzmir"
  const orMatch = p.match(/([a-zA-Z0-9çğıöşüÇĞİÖŞÜ_-]+)\s*(?:veya|ya da|\|)\s*([a-zA-Z0-9çğıöşüÇĞİÖŞÜ_-]+)/i);
  if (orMatch) {
    const v1 = orMatch[1].trim();
    const v2 = orMatch[2].trim();
    return {
      hasBcFilter: true,
      filterExpression: `${v1}|${v2}`,
      explanation: `${v1} veya ${v2} süzülüyor`,
    };
  }

  // 9. Başlayanlar / Bitenler / İçerenler (Wildcards)
  const startsWithMatch = p.match(/([a-zA-Z0-9çğıöşüÇĞİÖŞÜ_-]+)\s*(?:ile|le|la)?\s*(?:başlayan|başlayanlar)/i);
  if (startsWithMatch) {
    const prefix = startsWithMatch[1].trim();
    return {
      hasBcFilter: true,
      filterExpression: `${prefix}*`,
      explanation: `"${prefix}" ile başlayanlar süzülüyor`,
    };
  }

  const endsWithMatch = p.match(/([a-zA-Z0-9çğıöşüÇĞİÖŞÜ_-]+)\s*(?:ile|le|la)?\s*(?:biten|bitenler|sonu)/i);
  if (endsWithMatch) {
    const suffix = endsWithMatch[1].trim();
    return {
      hasBcFilter: true,
      filterExpression: `*${suffix}`,
      explanation: `"${suffix}" ile bitenler süzülüyor`,
    };
  }

  const containsMatch = p.match(/(?:içinde|içeren|gecen|geçen)\s+([a-zA-Z0-9çğıöşüÇĞİÖŞÜ_-]+)/i);
  if (containsMatch) {
    const part = containsMatch[1].trim();
    return {
      hasBcFilter: true,
      filterExpression: `*${part}*`,
      explanation: `İçinde "${part}" geçenler süzülüyor`,
    };
  }

  return {
    hasBcFilter: false,
    filterExpression: "",
    explanation: "",
  };
}

/**
 * Doğal dildeki filtre cümlelerinden gereksiz sohbet kelimelerini ayıklayarak
 * temiz arama terimini veya BC sözdizimini (SKU-001, >0, 100..500 vb.) çıkarır.
 */
/**
 * Değersiz kalan kısa ifadelerden (örn. tırnağı çıkarınca geriye sadece
 * "itemname" kalan promptlar) kolon kavram ipucu üretir.
 */
function detectHintFromBarePhrase(pLower: string): string | undefined {
  const p = pLower.trim();
  const compound = p.match(
    /^(sku|item|ürün|urun|malzeme|product)\s*(name|ad[ıi]?|code|kod[u]?|no|numara(?:s[ıi])?|id)$/
  );
  if (compound) {
    const qual = compound[2]!;
    return /^(name|ad[ıi]?|description|açıklama|aciklama|tan[ıi]m)$/.test(qual)
      ? "description"
      : "item_code";
  }
  if (/^(aktif|pasif|iptal|onay|bekle|taslak|kapalı|açık|active|inactive|cancel|approved|pending|draft|open|closed)\b/.test(p))
    return "status";
  if (/\b(sku|item|ürün|malzeme|kod|code)\b/.test(p)) return "item_code";
  if (/\b(depo|warehouse)\b/.test(p)) return "warehouse";
  if (/\b(şehir|sehir|city)\b/.test(p)) return "city";
  if (/\b(tarih|date|ay|yıl|yil)\b/.test(p)) return "date";
  return undefined;
}

/**
 * Prompt içinde GERÇEK bir kolon adı/etiketi geçiyor mu? (kelime dizisi eşleşmesi,
 * aksan-sade). Bulursa {name, start, end} döner — kullanıcı açıkça kolon belirtmiştir.
 */
export function matchExplicitColumn(
  prompt: string,
  knownColumns: string[]
): { name: string; start: number; end: number } | undefined {
  if (!prompt || !knownColumns?.length) return undefined;
  const words: Array<{ w: string; s: number; e: number }> = [];
  const re = /[^\s,.;:!?]+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(prompt))) {
    words.push({ w: foldWord(m[0]), s: m.index, e: m.index + m[0].length });
  }
  let best: { name: string; start: number; end: number } | undefined;
  for (const col of knownColumns) {
    if (!col) continue;
    const parts = String(col)
      .split(/[^\p{L}\p{N}]+/u)
      .filter(Boolean)
      .map(foldWord);
    if (parts.length === 0) continue;
    for (let i = 0; i + parts.length <= words.length; i++) {
      let ok = true;
      for (let j = 0; j < parts.length; j++) {
        if (words[i + j]!.w !== parts[j]) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      const start = words[i]!.s;
      const end = words[i + parts.length - 1]!.e;
      const longer = !best || end - start > best.end - best.start;
      if (longer) best = { name: col, start, end };
    }
  }
  return best;
}

function foldWord(w: string): string {
  const FOLD: Record<string, string> = {
    ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u",
    Ç: "c", Ğ: "g", İ: "i", I: "i", Ö: "o", Ş: "s", Ü: "u",
  };
  return w
    .replace(/[çğıöşüÇĞİIÖŞÜ]/g, (ch) => FOLD[ch] ?? ch)
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function extractCleanFilterValue(
  prompt: string,
  knownColumns?: string[]
): { value: string; columnHint?: string; quoted?: boolean } {
  const p = prompt.trim();
  const pLower = p.toLowerCase();

  // -2. AÇIK KOLON ADI: kullanıcı prompt'ta gerçek bir kolon adı/etiketi yazdıysa
  // (örn. "unit price 25" + tabloda "Unit Price") bu EN YÜKSEK önceliktir; değer,
  // kolon kelimeleri çıkarılarak kalır.
  if (knownColumns?.length) {
    const explicit = matchExplicitColumn(p, knownColumns);
    if (explicit) {
      const outside =
        (p.slice(0, explicit.start) + " " + p.slice(explicit.end)).trim();
      const rest = extractCleanFilterValue(outside);
      return { value: rest.value, columnHint: explicit.name };
    }
  }

  // -1. TIRNAKLI LITERAL: "..." içindeki metin olduğu gibi alınır; stopwords,
  // bileşik ayırma ve kolon-kelime sökme ASLA uygulanmaz. Kolon ipucu yalnızca
  // tırnak DIŞINDAKİ kelimelerden çıkarılır.
  //   örnek: itemname "Sample Item 14" → value:'"Sample Item 14"', hint=item adı kavramı
  const quoteMatch = p.match(/(["“'«])(.+?)\1/);
  if (quoteMatch && quoteMatch[2].trim()) {
    const outside = p.replace(quoteMatch[0], " ");
    const innerHint =
      extractCleanFilterValue(outside).columnHint ??
      detectHintFromBarePhrase(outside.toLowerCase());
    return {
      value: `${quoteMatch[1]}${quoteMatch[2].trim()}${quoteMatch[1]}`,
      columnHint: innerHint,
      quoted: true,
    };
  }

  // 0.0 Doğrudan ! ile başlayan BC Hariç Tutma (örn: "!SKU-020", "!Ankara", "!0")
  if (p.startsWith("!")) {
    const inner = extractCleanFilterValue(p.slice(1).trim());
    return {
      value: `!${inner.value.replace(/^!+/, "")}`,
      columnHint: inner.columnHint,
    };
  }

  // 0. Açık Kolon + Karşılaştırma / Değer Sözdizimi (Örn: "qty>15", "qty > 15", "bakiye >= 100", "price < 50", "city: Ankara", "sku = SKU-001")
  const colExprMatch = p.match(/^([a-zA-ZçğıöşüÇĞİÖŞÜ0-9_]+)\s*([<>]=?|=|:|!=|<>|\.\.)\s*(.+)$/);
  if (colExprMatch) {
    const colPart = colExprMatch[1].trim();
    const opPart = colExprMatch[2].trim();
    const valPart = colExprMatch[3].trim();

    let finalVal = valPart;
    if (opPart === ">" || opPart === ">=" || opPart === "<" || opPart === "<=" || opPart === "<>") {
      finalVal = `${opPart}${valPart}`;
    } else if (opPart === "..") {
      finalVal = `..${valPart}`;
    }

    return {
      value: finalVal,
      columnHint: colPart,
    };
  }

  // 1. Önce Business Central sözdizimi (>0, =0, 100..500, !Ankara vb.) kontrolü
  const synthesized = synthesizeBcFilter(p);
  if (synthesized.hasBcFilter && synthesized.filterExpression) {
    return { value: synthesized.filterExpression, columnHint: synthesized.targetColumnHint };
  }

  // 2. Yapılandırılmış SKU/Kod tespiti (örn: SKU-001, ITEM-102, WH-01, BATCH-006, LOT-12, SN-99)
  const codeMatch = p.match(/(?:^|\s)([a-zA-Z0-9]+(?:[-_][a-zA-Z0-9]+)+)(?:\s|$|[.,?!])/);
  if (codeMatch && codeMatch[1]) {
    const codeVal = codeMatch[1].trim();
    let colHint: string | undefined;
    const prefix = codeVal.split(/[-_]/)[0].toLowerCase();

    if (/^(wh|depo|warehouse|lokasyon)/i.test(prefix) || pLower.includes("depo") || pLower.includes("warehouse")) {
      colHint = "warehouse";
    } else if (/^(batch|lot|parti)/i.test(prefix) || pLower.includes("batch") || pLower.includes("lot") || pLower.includes("parti")) {
      colHint = "batch_number";
    } else if (/^(ser|sn|seri|serial)/i.test(prefix) || pLower.includes("seri") || pLower.includes("serial")) {
      colHint = "serial_number";
    } else if (/^(sku|item|ürün|malzeme|prod)/i.test(prefix) || pLower.includes("item") || pLower.includes("sku") || pLower.includes("ürün")) {
      colHint = "item_code";
    }
    return { value: codeVal, columnHint: colHint };
  }

  // 3. Türkçe Unicode uyumlu stop-words ve eylem kelimeleri (yazım hataları dahil)
  const stopWords = new Set([
    "olan", "olanlar", "olanları", "olanlarını", "olanı", "olanların",
    "için", "ait", "kodlu", "numaralı", "numarasına", "göre", "bazında",
    "item", "itemlar", "itemları", "itemların", "itemler", "itemleri",
    "ürün", "ürünler", "ürünleri", "ürünlerin",
    "malzeme", "malzemeler", "malzemeleri", "malzemelerin",
    "kayıt", "kayıtlar", "kayıtları", "kayıtların", "kayit", "kayitlar",
    "satır", "satırlar", "satırları", "satırların", "satir", "satirlar",
    "depo", "depolar", "depoları", "depoların",
    "göster", "göstersin", "goster", "gostersin",
    "listele", "listelesin", "listesi", "liste",
    "süz", "süzsün", "suz", "suzsün", "süzme", "süzdür",
    "filtrele", "filtrelesin", "filtre", "filtresi",
    "filitrele", "filitrelesin", "filitre", "filitresi",
    "filtirele", "filtirelesin", "filtire",
    "getir", "getirsin", "bul", "ara", "istiyorum", "bana", "lütfen", "bir", "bu", "şu",
    "ay", "ayı", "ayın", "ayına", "ayindaki", "ayındaki", "aylar", "ayları",
    "yıl", "yılı", "yılına", "yil", "yili", "yilina", "sene", "senesi", "senesine"
  ]);

  const words = p.split(/[\s,.;:!?]+/);
  const remaining = words.filter((w) => w && !stopWords.has(w.toLowerCase()));
  const cleaned = remaining.join(" ").trim();

  // Kolon ipucu tespiti — kelime sınırıyla: "items"/"itemname" gibi bileşikler yanlış hint üretmesin.
  // Item ailesi bileşikleri NİTELİĞE göre ayrışır: itemname/item adı → description kavramı,
  // itemcode/item kodu → item_code kavramı. Değer, ipucu kelimelerinden arındırılır.
  //   "itemname timur" → hint=description, değer="timur"
  //   "ame timur" gibi eksik önekli girişlerde nitelik-kelimesi başta yakalanır.
  let columnHint: string | undefined;
  let preStripped: string | undefined;
  const itemCompound = pLower.match(
    /^(sku|item|ürün|urun|malzeme|product)\s*(name|ad[ıi]?|code|kod[u]?|no|numara(?:s[ıi])?|id)\s+(.+)$/
  );
  const qualFirst = pLower.match(
    /^(name|ad[ıi]?|description|açıklama|aciklama|tan[ıi]m|kod[u]?|code|numara(?:s[ıi])?)\s+(.+)$/
  );
  const NAME_QUAL_RE = /^(name|ad[ıi]?|description|açıklama|aciklama|tan[ıi]m)$/;
  if (itemCompound) {
    const qual = itemCompound[2]!;
    columnHint = NAME_QUAL_RE.test(qual) ? "description" : "item_code";
    preStripped = itemCompound[3]!.trim();
  } else if (qualFirst) {
    const qual = qualFirst[1]!;
    columnHint = NAME_QUAL_RE.test(qual) ? "description" : "item_code";
    preStripped = qualFirst[2]!.trim();
  } else if (/^(aktif|pasif|iptal|onay|bekle|taslak|kapalı|açık|active|inactive|cancel|approved|pending|draft|open|closed)\b/.test(pLower)) {
    columnHint = "status";
  } else if (/\b(sku|item|ürün|malzeme|kod|code)\b/.test(pLower)) {
    columnHint = "item_code";
  } else if (/\b(depo|warehouse)\b/.test(pLower)) {
    columnHint = "warehouse";
  } else if (/\b(şehir|sehir|city)\b/.test(pLower)) {
    columnHint = "city";
  } else if (/\b(tarih|date|ay|yıl|yil)\b/.test(pLower)) {
    columnHint = "date";
  }

  return { value: preStripped ?? cleaned, columnHint };
}

/**
 * Değer tırnakla sarılmışsa içeriği döndürür (literal sözleşmesi).
 * '"Sample Item 14"' → { content:"Sample Item 14", quoted:true }
 */
export function unwrapQuotedValue(v: string): { content: string; quoted: boolean } {
  const s = String(v ?? "").trim();
  const m = s.match(/^(["“'«])(.+)\1$/s);
  if (!m || !m[2].trim()) return { content: s, quoted: false };
  return { content: m[2].trim(), quoted: true };
}
