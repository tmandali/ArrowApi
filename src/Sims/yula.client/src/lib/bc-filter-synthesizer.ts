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

import {
  type SynthesizedFilterResult,
  TURKISH_MONTHS,
  synthesizeBcDateFilter,
} from "./bc-date-filter-synthesizer";
import {
  matchExplicitColumn,
  foldWord,
  extractCleanFilterValue,
  unwrapQuotedValue,
} from "./bc-filter-cleaner";

export type { SynthesizedFilterResult };
export {
  TURKISH_MONTHS,
  synthesizeBcDateFilter,
  matchExplicitColumn,
  foldWord,
  extractCleanFilterValue,
  unwrapQuotedValue,
};

export function synthesizeBcFilter(
  prompt: string,
  _availableColumns: string[] = []
): SynthesizedFilterResult {
  const p = prompt.trim();
  const pLower = p.toLowerCase();
  const now = new Date();

  // 0.0 Doğrudan ! ile başlayan BC Hariç Tutma Filtreleri (örn: "!SKU-020", "!Ankara", "!0", "!SKU-001&!SKU-002")
  if (/^!/.test(p)) {
    return {
      hasBcFilter: true,
      filterExpression: p,
      explanation: `"${p.replace(/^!+/, "")}" hariç tutuluyor`,
    };
  }

  // 0. Tarih & Ay / Yıl Aralıkları Sentezi (Örn: "2026 ağustos", "2026 yılı", "bu ay", "geçen ay")
  const dateResult = synthesizeBcDateFilter(pLower, now);
  if (dateResult) {
    return dateResult;
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
  if (
    /\b(sıfır hariç|sıfırdan farklı|0 olmayan|sıfır olmayan|stokta olanlar|stokta olan|mevcut stok|stok olanlar|stoktakiler)\b/i.test(
      pLower
    ) ||
    (pLower.includes("stok") &&
      (pLower.includes("olan") ||
        pLower.includes("süz") ||
        pLower.includes("göster")))
  ) {
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
  const rangeMatch = pLower.match(
    /(\d+(?:[.,]\d+)?)\s*(?:ile|ila|-|\.\.)\s*(\d+(?:[.,]\d+)?)\s*(?:arasında|arası|aralığında)?/i
  );
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

  // 5. Alt Sınır / Büyüktür: "50000 üzeri", "50000'den büyük", "en az 50000", ">= 50000"
  const minMatch =
    pLower.match(/(?:en az|minimum|taban)\s*(\d+(?:[.,]\d+)?)/i) ||
    pLower.match(
      /(\d+(?:[.,]\d+)?)\s*(?:\x27den|\x27dan|den|dan)?\s*(?:büyük|büyükler|fazla|üzeri|üstü|ve üzeri)/i
    );
  if (minMatch && !pLower.includes("tarih") && !pLower.includes("gün") && !pLower.includes("ay")) {
    const num = minMatch[1].replace(",", ".");
    return {
      hasBcFilter: true,
      filterExpression: `>${num}`,
      explanation: `${num} üzeri değerler süzülüyor`,
    };
  }

  // 6. Üst Sınır / Küçüktür: "1000 altı", "1000'den küçük", "en fazla 1000", "maksimum 1000"
  const maxMatch =
    pLower.match(/(?:en fazla|en çok|maksimum|tavan)\s*(\d+(?:[.,]\d+)?)/i) ||
    pLower.match(
      /(\d+(?:[.,]\d+)?)\s*(?:\x27den|\x27dan|den|dan)?\s*(?:küçük|küçükler|az|altı|ve altı)/i
    );
  if (maxMatch && !pLower.includes("tarih") && !pLower.includes("gün")) {
    const num = maxMatch[1].replace(",", ".");
    return {
      hasBcFilter: true,
      filterExpression: `<${num}`,
      explanation: `${num} altı değerler süzülüyor`,
    };
  }

  // 7. Çoklu Hariç Tutma (Exclusion): "Ankara ve İzmir hariç", "Ankara ile Bursa dışındakiler"
  const multiExclMatch = p.match(
    /([a-zA-Z0-9çğıöşüÇĞİÖŞÜ_-]+)\s*(?:ve|ile|,)\s*([a-zA-Z0-9çğıöşüÇĞİÖŞÜ_-]+)\s*(?:hariç|dışında|olmayan)/i
  );
  if (multiExclMatch) {
    const v1 = multiExclMatch[1].trim();
    const v2 = multiExclMatch[2].trim();
    return {
      hasBcFilter: true,
      filterExpression: `!${v1}&!${v2}`,
      explanation: `${v1} ve ${v2} hariç tutuluyor`,
    };
  }

  // 8. Tekli Hariç Tutma (Exclusion): "Ankara hariç", "SKU-020 hariç", "SKU-001 olmayanlar", "İptal dışındakiler"
  const singleExclMatch = p.match(
    /([a-zA-Z0-9çğıöşüÇĞİÖŞÜ_-]+)\s*(?:hariç|dışında|olmayanlar|olmayan|dışındakiler)/i
  );
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

  // 9. VEYA / Çoklu Seçim (OR): "Ankara veya İzmir", "Ankara ya da İzmir", "Ankara | İzmir"
  const orMatch = p.match(
    /([a-zA-Z0-9çğıöşüÇĞİÖŞÜ_-]+)\s*(?:veya|ya da|\|)\s*([a-zA-Z0-9çğıöşüÇĞİÖŞÜ_-]+)/i
  );
  if (orMatch) {
    const v1 = orMatch[1].trim();
    const v2 = orMatch[2].trim();
    return {
      hasBcFilter: true,
      filterExpression: `${v1}|${v2}`,
      explanation: `${v1} veya ${v2} süzülüyor`,
    };
  }

  // 10. Başlayanlar / Bitenler / İçerenler (Wildcards)
  const startsWithMatch = p.match(
    /([a-zA-Z0-9çğıöşüÇĞİÖŞÜ_-]+)\s*(?:ile|le|la)?\s*(?:başlayan|başlayanlar)/i
  );
  if (startsWithMatch) {
    const prefix = startsWithMatch[1].trim();
    return {
      hasBcFilter: true,
      filterExpression: `${prefix}*`,
      explanation: `"${prefix}" ile başlayanlar süzülüyor`,
    };
  }

  const endsWithMatch = p.match(
    /([a-zA-Z0-9çğıöşüÇĞİÖŞÜ_-]+)\s*(?:ile|le|la)?\s*(?:biten|bitenler|sonu)/i
  );
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
