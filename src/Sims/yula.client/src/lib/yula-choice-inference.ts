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

export interface UserChoiceOption {
  label: string;
  value?: string;
  description?: string;
  rationale?: string;
  badge?: string;
}

export interface UserChoiceData {
  question: string;
  options: UserChoiceOption[];
  allowCustom: boolean;
  customPlaceholder?: string;
}

/**
 * Parses raw tool input and output structures into UserChoiceData.
 */
export function parseChoiceData(input?: unknown, output?: unknown): UserChoiceData | null {
  const inObj = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const outObj = (output && typeof output === "object" ? output : {}) as Record<string, unknown>;
  const outDetails = (outObj.details && typeof outObj.details === "object" ? outObj.details : {}) as Record<string, unknown>;

  if (Object.keys(inObj).length === 0 && Object.keys(outObj).length === 0) {
    return null;
  }

  let question = "";
  if (typeof inObj.question === "string" && inObj.question.trim()) {
    question = inObj.question.trim();
  } else if (typeof outDetails.question === "string" && outDetails.question.trim()) {
    question = outDetails.question.trim();
  } else if (typeof outObj.question === "string" && outObj.question.trim()) {
    question = outObj.question.trim();
  }

  let rawOptions: unknown[] = [];
  if (Array.isArray(inObj.options) && inObj.options.length > 0) {
    rawOptions = inObj.options;
  } else if (Array.isArray(outDetails.options) && outDetails.options.length > 0) {
    rawOptions = outDetails.options;
  } else if (Array.isArray(outObj.options) && outObj.options.length > 0) {
    rawOptions = outObj.options;
  }

  const allowCustom =
    inObj.allow_custom !== undefined
      ? inObj.allow_custom !== false
      : outDetails.allow_custom !== undefined
        ? outDetails.allow_custom !== false
        : outObj.allow_custom !== undefined
          ? outObj.allow_custom !== false
          : true;

  const rawPlaceholder =
    inObj.custom_placeholder ?? outDetails.custom_placeholder ?? outObj.custom_placeholder;
  const customPlaceholder =
    typeof rawPlaceholder === "string" && rawPlaceholder.trim().length > 0
      ? rawPlaceholder.trim()
      : undefined;

  const options: UserChoiceOption[] = rawOptions
    .map((opt) => {
      if (typeof opt === "string") {
        return { label: opt.trim(), value: opt.trim() };
      }
      if (opt && typeof opt === "object") {
        const o = opt as Record<string, unknown>;
        const label = String(o.label ?? o.value ?? "").trim();
        const value = o.value != null ? String(o.value).trim() : undefined;
        const description = o.description != null ? String(o.description).trim() : undefined;
        const rationale = o.rationale != null ? String(o.rationale).trim() : undefined;
        const badge = o.badge != null ? String(o.badge).trim() : undefined;
        return { label, value, description, rationale, badge };
      }
      return { label: String(opt).trim() };
    })
    .filter((o) => o.label.length > 0);

  if (!question && options.length === 0) return null;

  return {
    question: question || "",
    options,
    allowCustom,
    customPlaceholder,
  };
}

