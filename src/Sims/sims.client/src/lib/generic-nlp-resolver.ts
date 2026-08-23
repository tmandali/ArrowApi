import type { ToolDefinition } from "./tool-registry";

export interface ResolvedToolCall {
  tool: string;
  arguments: Record<string, any>;
  customKind?: string;
  message: string;
  confidence: number;
}

export interface DateIntent {
  startDate: string;
  endDate: string;
  isRange: boolean;
  isExplicit: boolean;
  rawLabel: string;
}

const TURKISH_MONTHS_MAP: Record<string, { num: string; days: number }> = {
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
 * Türkçe büyük/küçük harf (İ/i, I/ı, Ş/ş, Ğ/ğ, Ü/ü, Ö/ö, Ç/ç) ve Unicode diakritik normalizasyonu.
 * "İptal", "IPTAL", "iptal", "İPTAL" -> "iptal"
 */
export function normalizeTurkish(str: string): string {
  if (!str) return "";
  return str
    .replace(/İ/g, "i")
    .replace(/I/g, "ı")
    .toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .normalize("NFC");
}

/**
 * Universal date intent parser supporting Turkish and English natural language.
 */
export function parseDateIntent(prompt: string, referenceDate = new Date()): DateIntent {
  const pLower = prompt.toLowerCase();
  
  const today = new Date(referenceDate);
  const todayIso = today.toISOString().split("T")[0];
  const currentYear = today.getFullYear();
  
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const yesterdayIso = yesterday.toISOString().split("T")[0];

  const last7Days = new Date(today);
  last7Days.setDate(today.getDate() - 7);
  const last7DaysIso = last7Days.toISOString().split("T")[0];

  const last30Days = new Date(today);
  last30Days.setDate(today.getDate() - 30);
  const last30DaysIso = last30Days.toISOString().split("T")[0];

  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const monthStartIso = monthStart.toISOString().split("T")[0];

  const yearStart = new Date(today.getFullYear(), 0, 1);
  const yearStartIso = yearStart.toISOString().split("T")[0];

  // Specific ISO Date Match (e.g. 2026-08-15 or 2026-08-01..2026-08-15)
  const rangeMatch = pLower.match(/(\d{4}-\d{2}-\d{2})\s*(\.\.|\s+ile\s+|-|\s+to\s+)\s*(\d{4}-\d{2}-\d{2})/);
  if (rangeMatch) {
    return {
      startDate: rangeMatch[1],
      endDate: rangeMatch[3],
      isRange: true,
      isExplicit: true,
      rawLabel: `${rangeMatch[1]}..${rangeMatch[3]}`,
    };
  }

  const singleIsoMatch = pLower.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (singleIsoMatch) {
    return {
      startDate: singleIsoMatch[1],
      endDate: singleIsoMatch[1],
      isRange: false,
      isExplicit: true,
      rawLabel: singleIsoMatch[1],
    };
  }

  // Yıl + Ay tespiti (örn: "2026 ağustos", "2026 ağustos ayı", "ağustos 2026")
  const ymMatch = pLower.match(/\b(20\d\d)\s+([a-zçğıöşü]+)/i) || pLower.match(/\b([a-zçğıöşü]+)\s+(20\d\d)/i);
  if (ymMatch) {
    const part1 = ymMatch[1].toLowerCase();
    const part2 = ymMatch[2].toLowerCase();
    const year = /^\d{4}$/.test(part1) ? part1 : part2;
    const monthName = /^\d{4}$/.test(part1) ? part2 : part1;
    const monthInfo = TURKISH_MONTHS_MAP[monthName];
    if (monthInfo) {
      const start = `${year}-${monthInfo.num}-01`;
      const end = `${year}-${monthInfo.num}-${String(monthInfo.days).padStart(2, "0")}`;
      return {
        startDate: start,
        endDate: end,
        isRange: true,
        isExplicit: true,
        rawLabel: `${year} ${monthName.toUpperCase()}`,
      };
    }
  }

  // Ay Adı (örn: "ağustos ayı", "mart kayıtları")
  for (const [mName, mInfo] of Object.entries(TURKISH_MONTHS_MAP)) {
    if (pLower.includes(mName) && (pLower.includes("ay") || pLower.includes("kayıt") || pLower.includes("süz") || pLower.includes("göster") || pLower.includes("listele"))) {
      const start = `${currentYear}-${mInfo.num}-01`;
      const end = `${currentYear}-${mInfo.num}-${String(mInfo.days).padStart(2, "0")}`;
      return {
        startDate: start,
        endDate: end,
        isRange: true,
        isExplicit: true,
        rawLabel: `${currentYear} ${mName.toUpperCase()}`,
      };
    }
  }

  // Yıl aralığı / Mali Yıl tespiti (örn: "2025-2026", "2025/2026", "2025..2026", "Mali Yıl: 2025-2026")
  const yrRangeMatch = pLower.match(/\b(20\d\d)\s*[-/..]\s*(20\d\d)\b/i);
  if (yrRangeMatch) {
    const y1 = yrRangeMatch[1];
    const y2 = yrRangeMatch[2];
    return {
      startDate: `${y1}-01-01`,
      endDate: `${y2}-12-31`,
      isRange: true,
      isExplicit: true,
      rawLabel: `${y1}-${y2} Mali Yılı`,
    };
  }

  // Yıl tespiti (örn: "2026 yılı", "2025 senesi", "2025")
  const yrMatch = pLower.match(/\b(20\d\d)\s*(?:yılı|senesi|yılına|senesine|mali yılı)?\b/i);
  if (yrMatch && (pLower.includes("yıl") || pLower.includes("sene") || pLower.includes("mali") || pLower.trim().split(/\s+/).length <= 3)) {
    const year = yrMatch[1];
    return {
      startDate: `${year}-01-01`,
      endDate: `${year}-12-31`,
      isRange: true,
      isExplicit: true,
      rawLabel: `${year} Yılı`,
    };
  }

  if (pLower.includes("30 gün") || pLower.includes("30 gun") || pLower.includes("1 ay") || pLower.includes("bir ay") || pLower.includes("last 30") || pLower.includes("aylık") || pLower.includes("aylik")) {
    return {
      startDate: last30DaysIso,
      endDate: todayIso,
      isRange: true,
      isExplicit: true,
      rawLabel: "Son 30 Gün",
    };
  }

  if (pLower.includes("7 gün") || pLower.includes("7 gun") || pLower.includes("hafta") || pLower.includes("last week") || pLower.includes("son 7")) {
    return {
      startDate: last7DaysIso,
      endDate: todayIso,
      isRange: true,
      isExplicit: true,
      rawLabel: "Son 7 Gün",
    };
  }

  if (pLower.includes("bu ay") || pLower.includes("this month")) {
    return {
      startDate: monthStartIso,
      endDate: todayIso,
      isRange: true,
      isExplicit: true,
      rawLabel: "Bu Ay Başı - Bugün",
    };
  }

  if (pLower.includes("bu yıl") || pLower.includes("bu yil") || pLower.includes("this year")) {
    return {
      startDate: yearStartIso,
      endDate: todayIso,
      isRange: true,
      isExplicit: true,
      rawLabel: "Bu Yıl Başı - Bugün",
    };
  }

  if (pLower.includes("dün") || pLower.includes("dun") || pLower.includes("yesterday")) {
    return {
      startDate: yesterdayIso,
      endDate: yesterdayIso,
      isRange: false,
      isExplicit: true,
      rawLabel: "Dün",
    };
  }

  if (pLower.includes("bugün") || pLower.includes("bugun") || pLower.includes("today")) {
    return {
      startDate: todayIso,
      endDate: todayIso,
      isRange: false,
      isExplicit: true,
      rawLabel: "Bugün",
    };
  }

  // Default implicit date range
  return {
    startDate: last30DaysIso,
    endDate: todayIso,
    isRange: true,
    isExplicit: false,
    rawLabel: "Varsayılan Aralık",
  };
}

/**
 * Detects keywords in prompt requesting filters not supported by the schema and returns guidance text.
 */
export function detectUnsupportedCriteriaGuidance(
  prompt: string,
  tool?: ToolDefinition | Omit<ToolDefinition, "execute">
): string {
  if (!tool || !prompt) return "";
  const pLower = prompt.toLowerCase();
  const hasActionVerb =
    pLower.includes("hazırla") ||
    pLower.includes("aç") ||
    pLower.includes("göster") ||
    pLower.includes("oluştur") ||
    pLower.includes("çalıştır") ||
    pLower.includes("rapor") ||
    pLower.includes("döküm") ||
    pLower.includes("listele");
  const props = tool.parameters?.properties || {};

  const domainKeywords: Record<string, string[]> = {
    "Depo": ["depo", "kadıköy", "kadikoy", "ambar", "lokasyon", "şube", "sube", "mağaza", "magaza"],
    "Renk / Beden": ["renk", "kırmızı", "kirmizi", "mavi", "yeşil", "yesil", "siyah", "beyaz", "beden", "numara", "boyut"],
    "Cari / Müşteri": ["müşteri", "musteri", "cari", "tedarikçi", "tedarikci", "bayi"],
    "Kategori / Marka": ["kategori", "marka", "grup", "reyon", "sezon"],
  };

  const detected: string[] = [];

  for (const [domainName, keywords] of Object.entries(domainKeywords)) {
    const matched = keywords.find((kw) => pLower.includes(kw));
    if (matched) {
      const isCovered = Object.entries(props).some(([k, p]) => {
        const fullDesc = `${k} ${p.description || ""}`.toLowerCase();
        return keywords.some((kw) => fullDesc.includes(kw));
      });

      if (!isCovered) {
        detected.push(`${matched} (${domainName})`);
      }
    }
  }

  if (detected.length === 0) return "";

  const validFieldTitles = Object.values(props)
    .map((p) => p.description?.split(":")[0]?.trim() || "")
    .filter((t) => t.length > 0 && !t.startsWith("["))
    .slice(0, 5);

  return `💡 **Bilgi:** Bu raporda **${detected.join(", ")}** filtresi bulunmamaktadır. Rapor desteklenen kriterlerle hazırlandı.\n*(Mevcut kriterler: ${validFieldTitles.join(", ") || "Tarih, Durum, Para Birimi"})*\n\n`;
}

/**
 * Damerau-Levenshtein tabanlı esnek benzerlik skoru (0.0 - 1.0 arası).
 * Yazım hataları, harf kaymaları (örn: "sotok" -> "stok", "balaca" -> "balance") için yüksek tolerans sunar.
 */
export function fuzzySimilarity(s1: string, s2: string): number {
  if (s1 === s2) return 1.0;
  if (!s1 || !s2) return 0.0;
  if (s1.includes(s2) || s2.includes(s1)) return 0.9;

  const len1 = s1.length;
  const len2 = s2.length;
  if (Math.abs(len1 - len2) > 3) return 0.0;

  const d: number[][] = [];
  for (let i = 0; i <= len1; i++) {
    d[i] = [i];
  }
  for (let j = 0; j <= len2; j++) {
    d[0][j] = j;
  }

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + cost
      );
      if (i > 1 && j > 1 && s1[i - 1] === s2[j - 2] && s1[i - 2] === s2[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }

  const maxLen = Math.max(len1, len2);
  const distance = d[len1][len2];
  return Math.max(0, (maxLen - distance) / maxLen);
}

function cleanTopicPhrase(str: string): string {
  return str
    .toLowerCase()
    .replace(/\b(raporu|raporunu|rapor|hazırla|hazirla|aç|ac|göster|goster|listele|getir|çıkar|cikar|döküm|dokum|ekranı|sayfası|lütfen|bana)\b/g, " ")
    .replace(/[^a-z0-9çğıöşü\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

import { synthesizeBcFilter, extractCleanFilterValue } from "@/lib/bc-filter-synthesizer";

/**
 * Dynamically resolves the best tool and binds criteria parameters from schema definitions.
 */
export function resolveGenericToolIntent(
  prompt: string,
  tools: Array<ToolDefinition | Omit<ToolDefinition, "execute">>,
  _screenContext?: any
): ResolvedToolCall {
  if (!tools || tools.length === 0) {
    return {
      tool: "",
      arguments: {},
      message: "Kayıtlı herhangi bir rapor aracı bulunamadı.",
      confidence: 0,
    };
  }

  const pLower = prompt.toLowerCase();
  const hasActionVerb =
    pLower.includes("hazırla") ||
    pLower.includes("aç") ||
    pLower.includes("göster") ||
    pLower.includes("oluştur") ||
    pLower.includes("çalıştır") ||
    pLower.includes("rapor") ||
    pLower.includes("döküm") ||
    pLower.includes("listele");

  // Genel Sistem / Workspace / Sohbet Sorguları Guard'ı (Rapor aracı çalıştırmadan doğrudan yanıt ver)
  const isConversationalOrSystemQuery =
    (pLower.includes("kaç workspace") ||
     pLower.includes("kac workspace") ||
     pLower.includes("hangi workspace") ||
     pLower.includes("çalışma alan") ||
     pLower.includes("calisma alan") ||
     pLower.includes("kaç modül") ||
     pLower.includes("kac modul") ||
     pLower.includes("sistemde ne var") ||
     pLower.includes("sen kimsin") ||
     pLower.includes("neler yapabilirsin") ||
     pLower.includes("yardım") ||
     pLower.includes("yardim")) &&
    !pLower.includes("hazırla") &&
    !pLower.includes("filtre") &&
    !pLower.includes("süz");

  if (isConversationalOrSystemQuery) {
    return {
      tool: "",
      arguments: {},
      message: "Sistemde toplam 6 adet bağımsız çalışma alanı (workspace) bulunmaktadır:\n• **Stock (Stok)**: Depo bakiyeleri, analitik ve izlenebilirlik\n• **Selling (Satış)**: Satış siparişleri, müşteriler ve teklifler\n• **Accounting (Muhasebe)**: Finansal kayıtlar, defterler ve bilanço\n• **Manufacturing (Üretim)**: İş emirleri ve üretim hatları\n• **Landed Cost (Maliyet)**: İthalat maliyet yükleme fişleri\n• **Settings (Ayarlar)**: Kullanıcı ve sistem tercihleri",
      confidence: 100,
    };
  }

  const dateIntent = parseDateIntent(prompt);

  // 1. Tool Matching by Relevance Score (including x-ai-aliases and Screen Scope Priority)
  const isViewingResults = Boolean(_screenContext?.activeDataSummary?.isViewingResults);
  const isAskingNewReport =
    pLower.includes("yeni rapor") ||
    pLower.includes("farklı rapor") ||
    pLower.includes("başka rapor") ||
    pLower.includes("raporunu aç") ||
    pLower.includes("raporunu hazırla") ||
    pLower.includes("ekranına git") ||
    pLower.includes("sayfasına geç");

  let bestTool = tools[0];
  let maxScore = -999;

  const pTopicClean = cleanTopicPhrase(pLower);
  const pTopicWords = pTopicClean.split(/\s+/).filter((w) => w.length >= 3);

  for (const t of tools) {
    let score = 0;
    const nameWords = t.name.toLowerCase().replace(/^filter_/, "").split(/[_\s-]+/);
    const desc = t.description.toLowerCase();

    // Ekranda açık bir sonuç tablosu varken, kullanıcı açıkça yeni bir rapor istemedikçe kriter araçlarını devre dışı bırak
    if (isViewingResults && !isAskingNewReport) {
      if (t.scope?.type !== "screen") {
        score -= 500; // Kriter form araçlarını bastır
      } else {
        score += 150; // Ekran içi araçlara (filter_active_grid, analyze_grid_data, clear_grid_filters) dev öncelik
      }
    } else if (t.scope?.type === "screen") {
      score += 40;
    }

    if (t.name === "analyze_grid_data" && (pLower.includes("özet") || pLower.includes("grafik") || pLower.includes("analiz") || pLower.includes("toplam") || pLower.includes("en yüksek") || pLower.includes("dağılım") || pLower.includes("kpi"))) {
      score += 250;
    }

    if (t.name === "detect_grid_anomalies" && (pLower.includes("anomali") || pLower.includes("anormal") || pLower.includes("risk") || pLower.includes("eksi") || pLower.includes("negatif") || pLower.includes("kritik") || pLower.includes("ölü") || pLower.includes("olu stok") || pLower.includes("sorun"))) {
      score += 350;
    }

    if (t.name === "clear_grid_filters" && (pLower.includes("temizle") || pLower.includes("sıfırla") || pLower.includes("kaldır") || pLower.includes("tümünü göster"))) {
      score += 300;
    }

    if (t.name === "filter_active_grid" && isViewingResults && (pLower.includes("süz") || pLower.includes("filtre") || pLower.includes("göster") || pLower.includes("olan") || pLower.includes("olanlar") || pLower.includes("istiyorum") || pLower.includes("listele") || pLower.includes("ara") || pLower.includes("bul"))) {
      score += 200;
    }

    if (t.name === "query_report_data" && isViewingResults) {
      score -= 100;
    }

    // Aktif Açık Ekran / Rapor Kapsam Önceliği
    const activeScope = _screenContext?.activeReportScope || _screenContext?.screenId;
    const isCurrentScreenTool =
      Boolean(activeScope) &&
      activeScope !== "home" &&
      activeScope !== "item-form" &&
      t.name.includes(activeScope.replace(/[^a-zA-Z0-9_]/g, "_"));

    if (isCurrentScreenTool && !isViewingResults && !isAskingNewReport) {
      score += 450;
    }

    // Şema Enum Değeri Eşleşmesi (örn: "beklemede", "aktif", "iptal", "pasif", "try", "usd")
    const toolProps = t.parameters?.properties || {};
    for (const [_, propDef] of Object.entries(toolProps)) {
      const enums = propDef.enum || ((propDef as any).items && !Array.isArray((propDef as any).items) ? (propDef as any).items.enum : undefined);
      if (Array.isArray(enums)) {
        for (const opt of enums) {
          const optLower = String(opt).toLowerCase();
          if (
            pLower.includes(optLower) ||
            (optLower === "aktif" && (pLower.includes("aktif") || pLower.includes("active") || pLower.includes("aktfi"))) ||
            (optLower === "beklemede" && (pLower.includes("bekleme") || pLower.includes("beklemede") || pLower.includes("bekleyen") || pLower.includes("beklede"))) ||
            (optLower === "iptal" && (pLower.includes("iptal") || pLower.includes("cancel") || pLower.includes("itpal"))) ||
            (optLower === "pasif" && (pLower.includes("pasif") || pLower.includes("passive") || pLower.includes("kapalı") || pLower.includes("kapali"))) ||
            (optLower === "try" && (pLower.includes("tl") || pLower.includes("lira") || pLower.includes("türk lirası"))) ||
            (optLower === "usd" && (pLower.includes("dolar") || pLower.includes("dollar") || pLower.includes("usd"))) ||
            (optLower === "eur" && (pLower.includes("euro") || pLower.includes("eur") || pLower.includes("avro")))
          ) {
            score += isCurrentScreenTool ? 140 : 70;
            break;
          }
        }
      }
    }

    // 1. Check aliases: Best single alias match (multi-loop birikim hatasını önler)
    let bestAliasScore = 0;
    const aliasMatch = desc.match(/\[eşanlamlılar \/ aliases:\s*([^\]]+)\]/i);
    const aliases = t.ai?.aliases ?? (aliasMatch?.[1]?.split(",") || []);
    if (aliases.length > 0) {
      const normalizedAliases = aliases.map((alias) => alias.trim().toLowerCase());
      for (const alias of normalizedAliases) {
        if (!alias) continue;
        const aTopicClean = cleanTopicPhrase(alias);
        if (!aTopicClean) continue;

        if (pTopicClean === aTopicClean || (pTopicClean && aTopicClean && (pTopicClean.includes(aTopicClean) || aTopicClean.includes(pTopicClean)))) {
          bestAliasScore = Math.max(bestAliasScore, 140);
        } else {
          // Whole topic phrase similarity (örn: "stok balace" <-> "stock balance")
          const phraseSim = fuzzySimilarity(pTopicClean, aTopicClean);
          if (phraseSim >= 0.70) {
            bestAliasScore = Math.max(bestAliasScore, Math.round(phraseSim * 120));
          } else {
            // Token-level match
            const aliasWords = aTopicClean.split(/\s+/).filter((w) => w.length >= 3);
            let matchedInAlias = 0;
            for (const pw of pTopicWords) {
              if (aliasWords.some((aw) => fuzzySimilarity(pw, aw) >= 0.70)) {
                matchedInAlias++;
              }
            }
            if (matchedInAlias > 0) {
              const coverage = matchedInAlias / Math.max(pTopicWords.length, aliasWords.length);
              bestAliasScore = Math.max(bestAliasScore, Math.round(coverage * 90));
            }
          }
        }
      }
    }
    score += bestAliasScore;

    // 2. Check quick prompts in description (e.g. [Hızlı Öneriler / Quick Prompts: ...])
    let bestQpScore = 0;
    const qpMatch = desc.match(/\[hızlı öneriler \/ quick prompts:\s*([^\]]+)\]/i);
    const quickPrompts = t.ai?.quickPrompts ?? (qpMatch?.[1]?.split("|") || []);
    if (quickPrompts.length > 0) {
      const qps = quickPrompts.map((prompt) => prompt.trim().toLowerCase());
      for (const q of qps) {
        if (!q) continue;
        if (pLower === q || (q.length >= 4 && pLower.includes(q))) {
          bestQpScore = Math.max(bestQpScore, 150);
        } else {
          const sim = fuzzySimilarity(pLower, q);
          if (sim >= 0.85) {
            bestQpScore = Math.max(bestQpScore, Math.round(sim * 130));
          }
        }
      }
    }
    score += bestQpScore;

    // 4. Direct Report Name / Title Matching & Token Matching
    const titleClean = cleanTopicPhrase(desc.split(" raporunun kriterlerini")[0]);
    const titleTokens = titleClean.split(/\s+/).filter((w) => w.length >= 3);
    
    let matchedTokenCount = 0;
    let exactOrHighMatchCount = 0;
    for (const pw of pTopicWords) {
      for (const tw of titleTokens) {
        const sim = fuzzySimilarity(pw, tw);
        if (sim >= 0.70) {
          matchedTokenCount++;
          if (sim >= 0.85) exactOrHighMatchCount++;
          break;
        }
      }
    }

    if (exactOrHighMatchCount >= 2) {
      score += 140;
    } else if (matchedTokenCount >= 2) {
      score += 90;
    } else if (matchedTokenCount === 1) {
      score += 40;
    }

    // Action verbs combined with topic name words
    for (const w of nameWords) {
      for (const pw of pTopicWords) {
        const sim = fuzzySimilarity(pw, w);
        if (sim >= 0.70) {
          score += hasActionVerb ? 30 : 15;
          break;
        }
      }
    }

    if (isAskingNewReport || !activeScope || activeScope === "home") {
      for (const w of desc.split(/[\s,.:;!?"'()[\]{}]+/)) {
        if (w.length >= 4 && pLower.includes(w)) score += 2;
      }
    }

    if (score > maxScore) {
      maxScore = score;
      bestTool = t;
    }
  }

  const greetingKeywords = [
    "merhaba", "merhba", "meraba", "mrb", "selam", "slm", "selamlar",
    "günaydın", "gunaydin", "iyi günler", "iyi gunler", "iyi akşamlar", "iyi aksamlar",
    "nasılsın", "nasilsin", "kimsin", "yardım", "yardim", "hey", "hi", "hello"
  ];

  const isGreetingOrConversation =
    greetingKeywords.some((g) => pLower === g || pLower.startsWith(g + " ") || fuzzySimilarity(pLower, g) >= 0.72) &&
    !pLower.includes("rapor") &&
    !pLower.includes("filtre") &&
    !pLower.includes("süz") &&
    !pLower.includes("özet") &&
    !pLower.includes("grafik") &&
    !pLower.includes("analiz") &&
    !pLower.includes("stok") &&
    !pLower.includes("satış") &&
    !pLower.includes("bakiye");

  if (isGreetingOrConversation || maxScore <= 0) {
    const wsId = _screenContext?.workspaceId || "";
    const wsTitleMap: Record<string, { name: string; desc: string }> = {
      selling: { name: "Subcontracting (Fason & Dış Kaynak)", desc: "Fason siparişleri (Inward/Outward), teslimatlar, irsaliyeler veya sözleşmeler hakkında rapor hazırlamak ya da veri incelemek isterseniz lütfen bana bildirin." },
      subcontracting: { name: "Subcontracting (Fason & Dış Kaynak)", desc: "Fason siparişleri (Inward/Outward), teslimatlar, irsaliyeler veya sözleşmeler hakkında rapor hazırlamak ya da veri incelemek isterseniz lütfen bana bildirin." },
      stock: { name: "Stok (Stock)", desc: "Stok Bakiyesi ve Stok Analitik Raporu üzerinde filtrelemeler yapabilir, ambar veya envanter hareketlerinizi inceleyebilirsiniz." },
      accounting: { name: "Finans & Muhasebe (Accounting)", desc: "Finansal tablolar, defterler, mizan, alacak/borç ve bakiye analizleri hakkında yardımcı olmaktan memnuniyet duyarım." },
      "financial-reports": { name: "Finans & Muhasebe (Accounting)", desc: "Finansal tablolar, defterler, mizan, alacak/borç ve bakiye analizleri hakkında yardımcı olmaktan memnuniyet duyarım." },
      manufacturing: { name: "Üretim (Manufacturing)", desc: "İş emirleri, operasyonlar, ürün reçeteleri ve üretim hatları hakkında yardımcı olabilirim." },
      landed_cost: { name: "Maliyet Dağıtımı (Landed Cost)", desc: "İthalat masrafları ve maliyet yükleme fişleri hakkında raporlar hazırlayabilirim." },
      settings: { name: "Kullanıcı Ayarları", desc: "AI model tercihlerinizi, API anahtarlarınızı veya profil ayarlarınızı yapılandırabilirsiniz." },
    };

    const wsInfo = wsTitleMap[wsId];
    let greetingMsg = "Merhaba! Size nasıl yardımcı olabilirim?";
    if (wsInfo) {
      greetingMsg = `Merhaba! Size nasıl yardımcı olabilirim?\n\nŞu an **${wsInfo.name}** çalışma alanındasınız. ${wsInfo.desc} Size yardımcı olmaktan memnuniyet duyarım.`;
    } else {
      greetingMsg = "Merhaba! Size nasıl yardımcı olabilirim? Rapor kriterlerinizi hazırlayabilir, verileri filtreleyebilir ya da grafik ve özet analizler oluşturabilirim.";
    }

    return {
      tool: "",
      arguments: {},
      message: greetingMsg,
      confidence: 0,
    };
  }

  let confidence = 0;
  if (isViewingResults && !isAskingNewReport) {
    if (maxScore >= 150) confidence = 95;
    else if (maxScore >= 50) confidence = 85;
    else confidence = 40;
  } else {
    if (maxScore >= 100) confidence = 95;
    else if (maxScore >= 50) confidence = 85;
    else if (maxScore >= 20) confidence = 65;
    else confidence = 30;
  }

  if (confidence < 50) {
    return {
      tool: "",
      arguments: {},
      message: "İsteğinizi aldım. Belirli bir ERP raporu veya tablo analizi belirtirseniz yardımcı olmaktan memnuniyet duyarım.",
      confidence: 0,
    };
  }

  // 2. Schema Property Binding & Semantic Date Behaviors
  const args: Record<string, any> = {};
  const singleSelectNotes: string[] = [];
  const props = bestTool.parameters?.properties || {};

  // Business Central / Dynamics 365 Filter Synthesizer (e.g. "100..500", "!Ankara&!İzmir", "SKU*", "<>0")
  const bcResult = synthesizeBcFilter(prompt, _screenContext?.activeDataSummary?.columns || []);
  if (bcResult.hasBcFilter) {
    if (props.query) args.query = bcResult.filterExpression;
    if (props.sku) args.sku = bcResult.filterExpression;
    if (bcResult.targetColumnHint && (props.column || bestTool.name.includes("grid")) && !args.column) {
      args.column = bcResult.targetColumnHint;
    }
  } else if (bestTool.name.includes("grid")) {
    const clean = extractCleanFilterValue(prompt);
    if (clean.value) {
      if (props.query) args.query = clean.value;
      if (props.sku) args.sku = clean.value;
      if (clean.columnHint && (props.column || bestTool.name.includes("grid")) && !args.column) {
        args.column = clean.columnHint;
      }
    }
  }

  // SKU / Ürün / Item Extraction (e.g. sku-001, sku102, sku: 123, SKU-001)
  const stopVerbs = new Set([
    "istiyorum", "istiyom", "göster", "goster", "getir", "filtrele", "süz", "suz",
    "hazırla", "hazirla", "aç", "ac", "listele", "bak", "olanlar", "olanları",
    "olanlari", "olan", "ve", "veya", "ile", "için", "icin", "bu", "şu", "su", "tüm",
    "tum", "hepsi", "rapor", "raporu", "kayıt", "kayit", "evrak", "durum", "aktif",
    "beklemede", "iptal", "pasif", "tl", "usd", "eur", "seç", "sec", "se", "seçiniz", "seciniz", "ayarla", "yap"
  ]);

  let skuVal: string | null = null;

  // 1. Explicit SKU pattern: SKU-101, ITM-002, ABC-123
  const explicitCodeMatch = pLower.match(/\b([a-z]{1,6}-\d{1,8})\b/i);
  if (explicitCodeMatch) {
    skuVal = explicitCodeMatch[1].toUpperCase();
  } else {
    // 2. Explicit prefix: sku: 123, ürün kodu: ABC, malzeme: XYZ
    const prefixMatch = pLower.match(/(?:sku|ürün kodu|urun kodu|malzeme kodu|barkod)[:\s-]+([a-zA-Z0-9_-]+)/i);
    if (prefixMatch) {
      const candidate = prefixMatch[1].trim();
      if (!stopVerbs.has(candidate.toLowerCase()) && candidate.length >= 2) {
        skuVal = candidate.toUpperCase();
      }
    }
  }

  if (skuVal) {
    if (props.sku) args.sku = skuVal.startsWith("SKU-") ? skuVal : `SKU-${skuVal}`;
    if (props.query) args.query = skuVal;
    if (props.product_code) args.product_code = skuVal;
    if (props.keyword) args.keyword = skuVal;

    // 2. Semantic properties in criteria schemas (e.g. urun, item, product, malzeme)
    for (const [propKey, propDef] of Object.entries(props)) {
      const pKeyLower = propKey.toLowerCase();
      const pTitle = ((propDef as any).title || "").toLowerCase();
      const pDesc = (propDef.description || "").toLowerCase();

      if (
        pKeyLower === "urun" ||
        pKeyLower === "ürün" ||
        pKeyLower === "item" ||
        pKeyLower === "product" ||
        pKeyLower === "malzeme" ||
        pTitle.includes("ürün") ||
        pTitle.includes("sku") ||
        pTitle.includes("item") ||
        pDesc.includes("ürün") ||
        pDesc.includes("sku")
      ) {
        if (propDef.type === "array") {
          args[propKey] = [skuVal];
        } else {
          args[propKey] = skuVal;
        }
      }
    }
  }

  // General text extraction for props.query if not yet matched
  if (props.query && !args.query) {
    const queryMatch = pLower.match(/(?:listede|tabloda|ekranda|sonuçlarda)\s+([^,.]+?)\s+(?:olanları|olan|olanlar|göster|filtrele)/i);
    if (queryMatch) {
      args.query = queryMatch[1].trim();
    }
  }

  // 2b. Column Name Extraction & Correction (e.g. "id değil item code olacak", "açıklama kolonunda ara")
  if (props.column || bestTool.name.includes("grid")) {
    const availableCols: string[] = _screenContext?.activeDataSummary?.columns || [];

    for (const col of availableCols) {
      const colClean = col.toLowerCase().replace(/[\s_-]+/g, " ");
      if (pLower.includes(col.toLowerCase()) || pLower.includes(colClean)) {
        args.column = col;
        break;
      }
    }

    if (!args.column) {
      if (pLower.includes("item code") || pLower.includes("itemcode") || pLower.includes("ürün kodu") || pLower.includes("malzeme kodu")) {
        args.column = "item_code";
      } else if (pLower.includes("item no") || pLower.includes("itemno") || pLower.includes("ürün no")) {
        args.column = "item_no";
      } else if (pLower.includes("açıklama") || pLower.includes("description") || pLower.includes("ürün adı") || pLower.includes("tanım")) {
        args.column = "description";
      } else if (pLower.includes("depo") || pLower.includes("warehouse") || pLower.includes("ambar")) {
        args.column = "warehouse";
      } else if (pLower.includes("miktar") || pLower.includes("quantity") || pLower.includes("adet")) {
        args.column = "quantity";
      }
    }
  }

  // 2c. Follow-up Context Inheritance (Örn: Kullanıcı sadece "id değil item code olacak" dediğinde önceki değeri koru)
  if ((props.query || props.sku) && !args.query && !args.sku) {
    const activeFilters = _screenContext?.activeFilters || {};
    for (const [_k, v] of Object.entries(activeFilters)) {
      if (v && typeof v === "string" && v.trim()) {
        args.query = v.trim();
        args.sku = v.trim();
        break;
      }
    }
  }

  // 2d. Few-Shot Data Grounding (Örnek satırlardan değer & kolon eşleştirmesi)
  const sampleRows: Array<Record<string, any>> = _screenContext?.activeDataSummary?.sampleRows || [];
  if (sampleRows.length > 0) {
    for (const row of sampleRows) {
      for (const [colName, rawVal] of Object.entries(row)) {
        if (rawVal === undefined || rawVal === null) continue;
        const valStr = String(rawVal).trim().toLowerCase();
        if (valStr.length >= 2 && pLower.includes(valStr)) {
          // Değer kullanıcı komutunda doğrudan geçiyor (Örn: 'SKU-001' item_code kolonunda)
          if (!args.column) {
            args.column = colName;
          }
          if (!args.query && !args.sku) {
            args.query = String(rawVal);
          }
          break;
        }
      }
    }
  }

  // City Extraction (e.g. ankara, istanbul, izmir, bursa, antalya)
  if (props.city) {
    const cityMatch = pLower.match(/(ankara|istanbul|izmir|bursa|antalya|adana|konya|gaziantep)/i);
    if (cityMatch) {
      args.city = cityMatch[1].charAt(0).toUpperCase() + cityMatch[1].slice(1).toLowerCase();
    }
  }

  // Boolean toggles (e.g. sadece stoktakiler, stokta olanlar)
  if (props.in_stock_only || props.only_in_stock) {
    if (pLower.includes("stok") && (pLower.includes("olan") || pLower.includes("sadece") || pLower.includes("mevcut"))) {
      const key = props.in_stock_only ? "in_stock_only" : "only_in_stock";
      args[key] = true;
    }
  }

  // Chart & Analytics options for analyze_grid_data
  if (bestTool.name === "analyze_grid_data") {
    if (pLower.includes("pasta") || pLower.includes("pie") || pLower.includes("oran") || pLower.includes("yüzde")) {
      args.chartType = "pie";
    } else if (pLower.includes("çubuk") || pLower.includes("bar") || pLower.includes("en yüksek") || pLower.includes("sıralı")) {
      args.chartType = "bar";
    } else if (pLower.includes("kpi") || pLower.includes("toplam") || pLower.includes("metrik")) {
      args.chartType = "kpi";
    }
  }

  // Declarative Date Behavior Detection
  let fromKey: string | undefined;
  let toKey: string | undefined;
  let singleDateKey: string | undefined;

  for (const [key, propDef] of Object.entries(props)) {
    const desc = propDef.description || "";
    if (desc.includes("[Tarih Davranışı: range_start]")) {
      fromKey = key;
    } else if (desc.includes("[Tarih Davranışı: range_end]")) {
      toKey = key;
    } else if (desc.includes("[Tarih Davranışı: range_string]")) {
      singleDateKey = key;
    }
  }

  // Heuristic Fallback if declarative annotations are absent
  if (!fromKey) fromKey = Object.keys(props).find((k) => /^(from.*date|start.*date|baslangic.*tarih.*)/i.test(k));
  if (!toKey) toKey = Object.keys(props).find((k) => /^(to.*date|end.*date|bitis.*tarih.*)/i.test(k));
  if (!singleDateKey) singleDateKey = Object.keys(props).find((k) => /^(kayit.*tarih.*|date|tarih)/i.test(k));

  // Determine if we should set date fields (ONLY if user explicitly mentioned dates or explicit report action)
  if (dateIntent.isExplicit || (hasActionVerb && dateIntent.startDate && dateIntent.endDate)) {
    if (fromKey && toKey) {
      args[fromKey] = dateIntent.startDate;
      args[toKey] = dateIntent.endDate;
    } else if (singleDateKey) {
      args[singleDateKey] = dateIntent.isRange
        ? `${dateIntent.startDate}..${dateIntent.endDate}`
        : dateIntent.startDate;
    }
  }

  const pNorm = normalizeTurkish(prompt);

  // Enum and Value Matching (Supports multiple selections for array properties like durum: ["AKTIF", "BEKLEMEDE"])
  for (const [key, propDef] of Object.entries(props)) {
    if (key === fromKey || key === toKey || key === singleDateKey) continue;

    const enums: string[] =
      propDef.enum ||
      ((propDef as any).items && !Array.isArray((propDef as any).items)
        ? (propDef as any).items.enum
        : []) ||
      [];

    if (enums.length > 0) {
      interface EnumMatch {
        opt: string;
        pos: number;
      }
      const matchedList: EnumMatch[] = [];
      const pWords = pNorm.split(/\s+/).filter(Boolean);

      const checkFuzzyWord = (targets: string[]): { matched: boolean; pos: number } => {
        for (const w of pWords) {
          for (const t of targets) {
            if (w === t || w.includes(t) || t.includes(w) || (w.length >= 4 && fuzzySimilarity(w, t) >= 0.72)) {
              return { matched: true, pos: pNorm.indexOf(w) };
            }
          }
        }
        return { matched: false, pos: -1 };
      };

      for (const opt of enums) {
        const optNorm = normalizeTurkish(String(opt));
        let matchResult = { matched: false, pos: -1 };

        if (optNorm === "iptal") {
          matchResult = checkFuzzyWord(["iptal", "cancel", "itpal", "ipt"]);
        } else if (optNorm === "aktif") {
          matchResult = checkFuzzyWord(["aktif", "active", "aktfi", "akt"]);
        } else if (optNorm === "beklemede") {
          matchResult = checkFuzzyWord(["bekleme", "beklemede", "bekleyen", "beklede", "pending", "onay"]);
        } else if (optNorm === "pasif") {
          matchResult = checkFuzzyWord(["pasif", "passive", "pasfi", "kapali", "kapalı"]);
        } else if (optNorm === "try") {
          matchResult = checkFuzzyWord(["try", "tl", "lira", "turk lirasi"]);
        } else if (optNorm === "usd") {
          matchResult = checkFuzzyWord(["usd", "dolar", "dollar", "dolra"]);
        } else if (optNorm === "eur") {
          matchResult = checkFuzzyWord(["eur", "euro", "avro", "avroy"]);
        } else {
          matchResult = checkFuzzyWord([optNorm]);
        }

        if (matchResult.matched && matchResult.pos >= 0) {
          if (!matchedList.some((m) => m.opt === opt)) {
            matchedList.push({ opt, pos: matchResult.pos });
          }
        }
      }

      // Cümlede geçiş sırasına göre sırala (kullanıcının ilk söylediği önceliklidir)
      matchedList.sort((a, b) => a.pos - b.pos);

      if (matchedList.length > 0) {
        if (propDef.type === "array") {
          args[key] = matchedList.map((m) => m.opt);
        } else {
          args[key] = matchedList[0].opt;
          if (matchedList.length > 1) {
            const fieldTitle = (propDef as any).title || key;
            const selectedOpt = matchedList[0].opt;
            const otherOpts = matchedList.slice(1).map((m) => m.opt).join(", ");
            singleSelectNotes.push(`💡 **${fieldTitle}:** Bu alan tekil bir seçimdir; cümlenizde ilk belirttiğiniz **${selectedOpt}** seçildi. (${otherOpts} aynı anda seçilemez.)`);
          }
        }
      }
    }

    // Number extraction for threshold / amount vs row count fields
    if (propDef.type === "number") {
      const pKeyLower = key.toLowerCase();
      const pTitle = ((propDef as any).title || "").toLowerCase();
      const pDesc = (propDef.description || "").toLowerCase();
      
      const isRowCountField =
        pKeyLower.includes("sample") ||
        pKeyLower.includes("satir") ||
        pKeyLower.includes("limit") ||
        pKeyLower.includes("count") ||
        pTitle.includes("satır") ||
        pDesc.includes("satır");

      const isAmountField =
        pKeyLower.includes("tutar") ||
        pKeyLower.includes("miktar") ||
        pKeyLower.includes("amount") ||
        pKeyLower.includes("fiyat") ||
        pKeyLower.includes("bakiye") ||
        pTitle.includes("tutar") ||
        pDesc.includes("tutar") ||
        pDesc.includes("parasal");

      // 1. Tutar / Parasal Değer Eşleştirme (örn: "50.000 TL üzeri", "100000 TL", "50000 tutar")
      if (isAmountField) {
        const amountMatch = pLower.match(/(\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)?)\s*(?:tl|try|usd|dolar|eur|euro|tutar|fiyat|lira)?\s*(?:üzeri|uzeri|büyük|buyuk|fazla|üstü|ustu|kadar|altı|alti)?/i);
        if (amountMatch && (pLower.includes("tl") || pLower.includes("try") || pLower.includes("usd") || pLower.includes("eur") || pLower.includes("tutar") || pLower.includes("üzeri") || pLower.includes("altı") || pLower.includes("büyük"))) {
          const rawNum = amountMatch[1];
          let parsedNum = 0;
          if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(rawNum)) {
            parsedNum = parseFloat(rawNum.replace(/\./g, "").replace(",", "."));
          } else {
            parsedNum = parseFloat(rawNum.replace(",", "."));
          }
          if (!isNaN(parsedNum) && parsedNum > 0) {
            args[key] = parsedNum;
          }
        }
      }

      // 2. Satır Sayısı / Test Limiti Eşleştirme (örn: "100 satır", "50 kayıt", "1000000 test")
      if (isRowCountField) {
        const rowMatch = pLower.match(/(\d{1,3}(?:\.\d{3})*|\d+)\s*(?:satır|satir|kayıt|kayit|adet|tane|test)/i);
        if (rowMatch) {
          const rawNum = rowMatch[1].replace(/\./g, "");
          const parsedInt = parseInt(rawNum, 10);
          if (!isNaN(parsedInt) && parsedInt > 0) {
            args[key] = parsedInt;
          }
        }
      }
    }
  }

  // 3. Guidance Note
  const guidanceNote = detectUnsupportedCriteriaGuidance(prompt, bestTool);

  const targetWorkspace = bestTool.scope?.id;
  const currentWorkspace = _screenContext?.workspaceId;

  const workspaceTitleMap: Record<string, string> = {
    stock: "Stok (Stock)",
    accounting: "Finans & Muhasebe (Accounting)",
    selling: "Satış & Subcontracting (Selling)",
    subcontracting: "Satış & Subcontracting (Selling)",
    manufacturing: "Üretim (Manufacturing)",
  };

  let crossWorkspaceNotice = "";
  if (targetWorkspace && currentWorkspace && targetWorkspace !== currentWorkspace && targetWorkspace !== "reports") {
    const targetTitle = workspaceTitleMap[targetWorkspace] || targetWorkspace;
    crossWorkspaceNotice = `💡 **Bilgi:** Bu rapor **${targetTitle}** çalışma alanı altında yer almaktadır. Kriterleriniz hazırlandı.\n\n`;
  }

  const combinedMessages = [crossWorkspaceNotice, guidanceNote, ...singleSelectNotes].filter(Boolean).join("\n\n");

  // If no parameters were extracted and user didn't ask to open/prepare a report, don't execute empty tools
  const hasActionableArgs = Object.keys(args).length > 0;
  if (!hasActionableArgs && !isAskingNewReport && !hasActionVerb) {
    return {
      tool: "",
      arguments: {},
      message: "Merhaba! Size nasıl yardımcı olabilirim? Rapor kriterlerinizi hazırlayabilir, verileri filtreleyebilir ya da grafik ve özet analizler oluşturabilirim.",
      confidence: 0,
    };
  }

  if (bestTool.name.includes("grid") || bestTool.name.includes("current")) {
    const val = args.query || args.sku || args.city || "filtreye";
    return {
      tool: bestTool.name,
      arguments: args,
      message: combinedMessages || `✓ Açık olan sonuç tablosu **"${val}"** filtresine göre süzüldü.`,
      confidence,
    };
  }

  return {
    tool: bestTool.name,
    arguments: args,
    message: combinedMessages.trim(),
    confidence,
  };
}
