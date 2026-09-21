import { synthesizeBcFilter } from "./bc-filter-synthesizer";

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

export function foldWord(w: string): string {
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
  knownColumns?: string[],
  opts?: { valueMode?: boolean }
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
      // Kalan metin prompt DEĞİL, değerdir: stopword/bileşik sökme uygulanmaz
      const rest = extractCleanFilterValue(
        outside,
        undefined,
        { valueMode: true }
      );
      return {
        value: rest.value,
        columnHint: explicit.name,
        quoted: rest.quoted,
      };
    }
  }

  // -1. TIRNAKLI LITERAL: "..." içindeki metin olduğu gibi alınır; stopwords,
  // bileşik ayırma ve kolon-kelime sökme ASLA uygulanmaz. Kolon ipucu yalnızca
  // tırnak DIŞINDAKİ kelimelerden çıkarılır.
  //   örnek: itemname "Sample Item 14" → value:'"Sample Item 14"', hint=item adı kavramı
  const quoteMatch = p.match(/(["“'«])(.+?)\1/);
  if (quoteMatch && quoteMatch[2].trim()) {
    const outside = p.replace(quoteMatch[0], " ");
    const innerHint = extractCleanFilterValue(outside, knownColumns, {
      valueMode: true,
    }).columnHint;
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

  // valueMode: kalan metin değerdir — stopword/nitelik sökme ASLA uygulanmaz.
  // Yalnızca BC sentezi/kod tespiti gibi değer-güvenli adımlar yukarıda koştu.
  if (opts?.valueMode) {
    return { value: p };
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

  // Kenar temizliği: yalnızca BAŞTAKİ ve SONDAKİ stopword/eylem kelimeleri
  // düşürülür; değerin İÇİNDEKİ kelimeler korunur ("Sample Item 4" bozulmaz).
  const words = p.split(/[\s,.;:!?]+/).filter(Boolean);
  const isStop = (w?: string) => (w ? stopWords.has(w.toLowerCase()) : false);
  let lo = 0;
  let hi = words.length - 1;
  while (lo <= hi && isStop(words[lo])) lo++;
  while (hi >= lo && isStop(words[hi])) hi--;
  const cleaned = words.slice(lo, hi + 1).join(" ").trim();

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
