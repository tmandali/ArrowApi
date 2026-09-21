export interface SynthesizedFilterResult {
  hasBcFilter: boolean;
  filterExpression: string;
  targetColumnHint?: string;
  explanation: string;
}

export const TURKISH_MONTHS: Record<string, { num: string; days: number }> = {
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

/**
 * Doğal dildeki tarih, ay ve yıl aralıklarını BC Expression tarih filtresine dönüştürür.
 */
export function synthesizeBcDateFilter(
  pLower: string,
  now: Date = new Date()
): SynthesizedFilterResult | undefined {
  const currentYear = now.getFullYear();

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
    if (
      pLower.includes(mName) &&
      (pLower.includes("ay") ||
        pLower.includes("kayıt") ||
        pLower.includes("süz") ||
        pLower.includes("göster") ||
        pLower.includes("listele"))
    ) {
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
  const yearOnlyMatch = pLower.match(
    /\b(20\d\d)\s*(?:yılı|senesi|yılına|senesine|senesindeki|yılındaki)\b/i
  );
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
  if (
    /\b(ge[çc]en\s*ay|ge[çc]\s*ay|ge[çc]en\s*ay[ıi]n|ö?o?nceki\s*ay|son\s*ay)\b/i.test(
      pLower
    )
  ) {
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
  if (
    /\b(bu\s*ay|bu\s*ay[ıi]n|bu\s*aydaki|mevcut\s*ay|ş?s?imdiki\s*ay)\b/i.test(
      pLower
    )
  ) {
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
  if (
    /\b(gelecek\s*ay|sonraki\s*ay|ö?o?n[üu]m[üu]zdeki\s*ay)\b/i.test(pLower)
  ) {
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
  if (
    /\b(ge[çc]en\s*y[ıi]l|ge[çc]\s*y[ıi]l|ge[çc]en\s*sene|ö?o?nceki\s*y[ıi]l)\b/i.test(
      pLower
    )
  ) {
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

  return undefined;
}
