/** Statik (`tool-<ad>`) ve dinamik parçaları tek forma indirger */
export interface YulaToolPartInfo {
  toolName: string;
  state: string;
  toolCallId: string;
  input?: unknown;
  output?: unknown;
  /** SDK ToolUIPart "output-error" state'inin kanonik hata metni */
  errorText?: string;
}

/**
 * `execute` ile SUNUCUDA koşan araçlar — istemci yürütme döngüsü
 * (runPendingTool) bunlara dokunmaz; aksi halde çift yürütme + hatalı
 * geçmişle resubmit olur. Yeni server-executed araç buraya eklenir.
 */
export const SERVER_EXECUTED_TOOLS: ReadonlySet<string> = new Set([
  "run_skill_script",
  "read_skill_file",
]);

export function yulaToolPartInfo(part: unknown): YulaToolPartInfo | null {
  const p = part as { type?: string } | null;
  if (!p?.type) return null;
  if (p.type === "dynamic-tool") {
    const q = p as {
      toolName?: string;
      state?: string;
      toolCallId?: string;
      input?: unknown;
      output?: unknown;
      errorText?: string;
    };
    return q.toolName && q.state && q.toolCallId
      ? {
          toolName: q.toolName,
          state: q.state,
          toolCallId: q.toolCallId,
          input: q.input,
          output: q.output,
          errorText: q.errorText,
        }
      : null;
  }
  if (p.type.startsWith("tool-")) {
    const q = p as {
      state?: string;
      toolCallId?: string;
      input?: unknown;
      output?: unknown;
      errorText?: string;
    };
    if ("state" in q && "toolCallId" in q) {
      return {
        toolName: p.type.slice("tool-".length),
        state: String(q.state),
        toolCallId: String(q.toolCallId),
        input: (q as { input?: unknown }).input,
        output: (q as { output?: unknown }).output,
        errorText: (q as { errorText?: string }).errorText,
      };
    }
  }
  return null;
}

/**
 * Yinelenen araç yürütmeyi kesen kanonik işaret — aynı turda aynı imzayla
 * yeniden çağrılan araca çıktı olarak verilir; model "değişmez, tekrar
 * çağırma" sinyalini okur. Kullanıcıya gösterilen metinlerde (fallback
 * balon / sessiz-tur uyarısı) GERÇEK hata sayılmaz — kasıtlı bastırmadır.
 */
export const DEDUPE_SKIP_MARKER =
  "This tool call was skipped as a duplicate in this turn";

export function isDedupeSkipOutput(info: YulaToolPartInfo): boolean {
  return (
    typeof info.errorText === "string" &&
    info.errorText.startsWith(DEDUPE_SKIP_MARKER)
  );
}

/**
 * Aynı adımda yinelenen `ask_user_question` çağrılarını bulur.
 * Model bazen tek adımda paralel iki soru çağrısı üretir (ikisi de çalışırsa
 * çift soru kartı çıkar); adım başına yalnız İLK çağrı yaşar, sonrakiler
 * bastırılmalıdır. Adım sınırı `step-start` parçalarıdır; farklı adım/mesajdaki
 * sorular (kullanıcı cevaplayıp model devam sorusu sorarsa) etkilenmez.
 * Dönüş: bastırılacak toolCallId kümesi.
 */
export function findDuplicateQuestionCallIds(
  messages: Array<{ role?: string; parts?: unknown[] }>,
): Set<string> {
  const duplicates = new Set<string>();
  for (const message of messages) {
    if (message?.role !== "assistant" || !Array.isArray(message.parts)) continue;
    // Adım bloklarına böl (step-start = sınır).
    const blocks: YulaToolPartInfo[][] = [[]];
    for (const part of message.parts) {
      if ((part as { type?: string })?.type === "step-start") {
        blocks.push([]);
        continue;
      }
      const info = yulaToolPartInfo(part);
      if (info) blocks[blocks.length - 1].push(info);
    }
    for (const block of blocks) {
      const asks = block.filter((i) => i.toolName === "ask_user_question");
      // İlk çağrı (durumu ne olursa olsun) yaşar; sonrakiler yinelenendir.
      for (const extra of asks.slice(1)) duplicates.add(extra.toolCallId);
    }
  }
  return duplicates;
}

export function isFailedToolInfo(info: YulaToolPartInfo): boolean {
  if (info.state === "output-error") return true;
  if (info.state === "output-available" && info.output && typeof info.output === "object") {
    const status = (info.output as { status?: string }).status;
    if (
      status === "error" ||
      status === "validation-error" ||
      status === "blocked"
    ) {
      return true;
    }
  }
  return false;
}
