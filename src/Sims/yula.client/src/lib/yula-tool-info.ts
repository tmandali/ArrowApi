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

export function yulaToolPartInfo(part: unknown): YulaToolPartInfo | null {
  const p = part as Record<string, unknown> | null;
  if (!p || typeof p !== "object") return null;

  // 1. Canonical / Core format: { tool: "ask_user_choice", input, output, ... }
  if (typeof p.tool === "string" && p.tool.length > 0) {
    const toolName = p.tool;
    const toolCallId = String(p.toolCallId || p.id || `tc_${toolName}`);
    const state = typeof p.state === "string" ? p.state : (p.output !== undefined ? "output-available" : "input-available");
    return {
      toolName,
      state,
      toolCallId,
      input: p.input,
      output: p.output,
      errorText: typeof p.errorText === "string" ? p.errorText : undefined,
    };
  }

  // 2. Direct toolName format: { toolName: "ask_user_choice", ... }
  if (typeof p.toolName === "string" && p.toolName.length > 0 && p.type !== "dynamic-tool") {
    const toolName = p.toolName;
    const toolCallId = String(p.toolCallId || p.id || `tc_${toolName}`);
    const state = typeof p.state === "string" ? p.state : (p.output !== undefined ? "output-available" : "input-available");
    return {
      toolName,
      state,
      toolCallId,
      input: p.input,
      output: p.output,
      errorText: typeof p.errorText === "string" ? p.errorText : undefined,
    };
  }

  // 3. Vercel AI SDK dynamic-tool
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

  // 4. Vercel AI SDK tool-<name>
  if (typeof p.type === "string" && p.type.startsWith("tool-")) {
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

  // 5. Tool Call / Tool Result (AI SDK v5 / agent-core format)
  if (p.type === "tool-call" || p.type === "tool_call" || p.type === "tool-result" || p.type === "toolResult") {
    const toolName = String(p.toolName || p.name || "");
    if (toolName) {
      const toolCallId = String(p.toolCallId || p.id || `tc_${toolName}`);
      const state = typeof p.state === "string" ? p.state : (p.result !== undefined || p.output !== undefined ? "output-available" : "input-available");
      return {
        toolName,
        state,
        toolCallId,
        input: p.input ?? p.args ?? p.arguments,
        output: p.output ?? p.result,
        errorText: typeof p.errorText === "string" ? p.errorText : undefined,
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
 * @deprecated Vercel AI SDK stopWhen: [hasToolCall("ask_user_choice")] motor seviyesinde
 * adımı tek soruda durdurduğu için artık adımda çift soru üretilmez.
 * Eski testler ve arşiv oturum kayıtları geriye dönük uyumluluğu için korunmaktadır.
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
      const asks = block.filter(
        (i) => i.toolName === "ask_user_question" || i.toolName === "ask_user_choice",
      );
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
