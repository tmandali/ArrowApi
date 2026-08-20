import type { ToolDefinition } from "./tool-registry";
import { useDraftCriteriaStore } from "@/store/slices/draft-criteria-store";

export interface ResolvedToolCall {
  tool: string;
  arguments: Record<string, any>;
  customKind?: string;
  message: string;
}

export interface DateIntent {
  startDate: string;
  endDate: string;
  isRange: boolean;
  isExplicit: boolean;
  rawLabel: string;
}

/**
 * Universal date intent parser supporting Turkish and English natural language.
 */
export function parseDateIntent(prompt: string, referenceDate = new Date()): DateIntent {
  const pLower = prompt.toLowerCase();
  
  const today = new Date(referenceDate);
  const todayIso = today.toISOString().split("T")[0];
  
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
export function detectUnsupportedCriteriaGuidance(prompt: string, tool?: ToolDefinition): string {
  if (!tool || !prompt) return "";
  const pLower = prompt.toLowerCase();
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
 * Dynamically resolves the best tool and binds criteria parameters from schema definitions.
 */
export function resolveGenericToolIntent(prompt: string, tools: ToolDefinition[]): ResolvedToolCall {
  if (!tools || tools.length === 0) {
    return {
      tool: "",
      arguments: {},
      message: "Kayıtlı herhangi bir rapor aracı bulunamadı.",
    };
  }

  const pLower = prompt.toLowerCase();
  const dateIntent = parseDateIntent(prompt);

  // 1. Tool Matching by Relevance Score (including x-ai-aliases)
  let bestTool = tools[0];
  let maxScore = -1;

  for (const t of tools) {
    let score = 0;
    const nameWords = t.name.toLowerCase().replace(/^filter_/, "").split(/[_\s-]+/);
    const desc = t.description.toLowerCase();

    // Check aliases in description (e.g. [Eşanlamlılar / Aliases: ...])
    const aliasMatch = desc.match(/\[eşanlamlılar \/ aliases:\s*([^\]]+)\]/i);
    if (aliasMatch && aliasMatch[1]) {
      const aliases = aliasMatch[1].split(",").map((a) => a.trim().toLowerCase());
      for (const alias of aliases) {
        if (alias.length > 2 && pLower.includes(alias)) {
          score += 15;
        }
      }
    }

    for (const w of nameWords) {
      if (w.length > 2 && pLower.includes(w)) score += 5;
    }
    for (const w of desc.split(/[\s,.:;!?"'()[\]{}]+/)) {
      if (w.length > 3 && pLower.includes(w)) score += 2;
    }

    if (score > maxScore) {
      maxScore = score;
      bestTool = t;
    }
  }

  // 2. Schema Property Binding & Semantic Date Behaviors
  const args: Record<string, any> = {};
  const props = bestTool.parameters?.properties || {};

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

  // Determine if we should set date fields (if explicit or no existing draft)
  const scope = bestTool.name.replace(/^filter_/, "");
  const existingRows = useDraftCriteriaStore.getState().rowsByScope[scope] || [];
  const hasExistingDates = existingRows.some((r) => r.name === fromKey || r.name === singleDateKey);

  if (dateIntent.isExplicit || !hasExistingDates) {
    if (fromKey && toKey) {
      args[fromKey] = dateIntent.startDate;
      args[toKey] = dateIntent.endDate;
    } else if (singleDateKey) {
      args[singleDateKey] = dateIntent.isRange
        ? `${dateIntent.startDate}..${dateIntent.endDate}`
        : dateIntent.startDate;
    }
  }

  // Enum and Value Matching
  for (const [key, propDef] of Object.entries(props)) {
    if (key === fromKey || key === toKey || key === singleDateKey) continue;

    const enums: string[] = propDef.enum || [];
    if (enums.length > 0) {
      for (const opt of enums) {
        const optLower = opt.toLowerCase();
        // Exact enum match or common aliases
        if (pLower.includes(optLower)) {
          if (propDef.type === "array") {
            args[key] = [opt];
          } else {
            args[key] = opt;
          }
          break;
        }

        // Common Aliases
        if (optLower === "iptal" && (pLower.includes("cancel") || pLower.includes("iptal"))) {
          args[key] = propDef.type === "array" ? [opt] : opt;
        } else if (optLower === "aktif" && (pLower.includes("active") || pLower.includes("aktif"))) {
          args[key] = propDef.type === "array" ? [opt] : opt;
        } else if (optLower === "try" && (pLower.includes("tl") || pLower.includes("lira") || pLower.includes("türk lirası"))) {
          args[key] = opt;
        } else if (optLower === "usd" && (pLower.includes("dolar") || pLower.includes("dollar"))) {
          args[key] = opt;
        } else if (optLower === "eur" && (pLower.includes("euro") || pLower.includes("avro"))) {
          args[key] = opt;
        }
      }
    }

    // Number extraction for threshold / amount fields
    if (propDef.type === "number") {
      const numMatch = pLower.match(/(\d+(?:[.,]\d+)?)\s*(tl|usd|adet|tutar|miktar|fiyat)?/);
      if (numMatch && (pLower.includes("tutar") || pLower.includes("miktar") || pLower.includes("büyük") || pLower.includes("küçük") || pLower.includes("üzeri"))) {
        const parsedNum = parseFloat(numMatch[1].replace(",", "."));
        if (!isNaN(parsedNum)) {
          args[key] = parsedNum;
        }
      }
    }
  }

  // 3. Guidance Note
  const guidanceNote = detectUnsupportedCriteriaGuidance(prompt, bestTool);

  return {
    tool: bestTool.name,
    arguments: args,
    message: `${guidanceNote}Lütfen aşağıdaki karttaki kriterleri inceleyin ve raporunuzu oluşturmak için **Çalıştır (Run)** veya tam ekran görmek için **Sayfada Aç** butonuna tıklayın.`,
  };
}
