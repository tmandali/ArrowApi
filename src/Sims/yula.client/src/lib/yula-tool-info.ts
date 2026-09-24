import type { ComponentSchema } from "@my-agent/core";

/** Bilinen standart sunucu araç isimleri */
export const KNOWN_SERVER_TOOLS = [
  "dispatch_component_action",
  "inspect_ui_state",
  "ask_user_choice",
  "ask_user_question",
  "request_user_confirmation",
  "suggest_next_steps",
  "remember_fact",
  "recall_fact",
  "query_playbook",
  "propose_playbook_update",
  "synthesize_collected_information",
  "explore_context",
] as const;

/** Bilinen istemci araç isimleri */
export const KNOWN_CLIENT_TOOLS = [
  "visualize_grid_data",
  "run_job",
  "run_expert_sql",
] as const;

/** Tüm bilinen kanonik araç isimleri */
export const KNOWN_TOOLS = [
  ...KNOWN_SERVER_TOOLS,
  ...KNOWN_CLIENT_TOOLS,
] as const;

export type StandardToolName = (typeof KNOWN_SERVER_TOOLS)[number];
export type KnownClientToolName = (typeof KNOWN_CLIENT_TOOLS)[number];
export type KnownToolName = (typeof KNOWN_TOOLS)[number];

/**
 * IDE'de bilinen araçları autocomplete eder,
 * ancak dinamik / harici (MCP vb.) araçları da güvenle kabul eder.
 */
export type YulaToolName = KnownToolName | (string & {});

const KNOWN_TOOLS_SET = new Set<string>(KNOWN_TOOLS);

/** Verilen ismin bilinen bir sistem aracı olup olmadığını doğrular */
export function isKnownToolName(name: unknown): name is KnownToolName {
  return typeof name === "string" && KNOWN_TOOLS_SET.has(name);
}

/** Bilinen bileşen ön ekleri ve kanonik kimlikleri */
export const RESULT_GRID_COMPONENT_ID = "result_grid:active" as const;
export const RESULT_GRID_COMPONENT_PREFIX = "result_grid" as const;

export type ResultGridComponentId =
  | typeof RESULT_GRID_COMPONENT_ID
  | `${typeof RESULT_GRID_COMPONENT_PREFIX}:${string}`
  | typeof RESULT_GRID_COMPONENT_PREFIX;

/** Bileşen kimliğinin bir sonuç ızgarası (result_grid) olup olmadığını doğrular */
export function isResultGridComponentId(id: unknown): id is ResultGridComponentId {
  return (
    typeof id === "string" &&
    (id === RESULT_GRID_COMPONENT_ID ||
      id.startsWith(`${RESULT_GRID_COMPONENT_PREFIX}:`) ||
      id === RESULT_GRID_COMPONENT_PREFIX)
  );
}

/** Bileşen nesnesinin geçerli bir sonuç ızgarası bileşeni olup olmadığını doğrular */
export function isResultGridComponent<T extends { id: string; meta?: unknown } = ComponentSchema>(
  comp: unknown
): comp is T & { id: ResultGridComponentId; meta?: unknown } {
  if (!comp || typeof comp !== "object") return false;
  const c = comp as { id?: unknown };
  return isResultGridComponentId(c.id);
}

/** Kanonik Core Part Şekli: { tool: "ask_user_choice", input?, output?, ... } */
export interface CanonicalToolPart {
  tool: YulaToolName;
  toolCallId?: string;
  id?: string;
  input?: unknown;
  output?: unknown;
  args?: unknown;
  arguments?: unknown;
  result?: unknown;
  state?: unknown;
  errorText?: string;
}

/** Gelen nesnenin kanonik { tool: string } araç parçası olup olmadığını doğrular */
export function isCanonicalToolPart(p: unknown): p is CanonicalToolPart {
  return (
    typeof p === "object" &&
    p !== null &&
    "tool" in p &&
    typeof (p as Record<string, unknown>).tool === "string" &&
    Boolean(((p as Record<string, unknown>).tool as string).trim())
  );
}

/** Statik (`tool-<ad>`) ve dinamik parçaları tek forma indirger */
export interface YulaToolPartInfo {
  toolName: YulaToolName;
  state: string;
  toolCallId: string;
  input?: unknown;
  output?: unknown;
  /** SDK ToolUIPart "output-error" state'inin kanonik hata metni */
  errorText?: string;
}

/** SDK ve Pi araç durumlarını UI tarafından beklenen kanonik durumlara eşler */
export function normalizeToolState(rawState: unknown, hasOutput: boolean): string {
  if (typeof rawState === "string") {
    if (rawState === "call" || rawState === "input-available") return "input-available";
    if (rawState === "result" || rawState === "output-available") return "output-available";
    if (rawState === "error" || rawState === "output-error") return "output-error";
    return rawState;
  }
  return hasOutput ? "output-available" : "input-available";
}

export function yulaToolPartInfo(part: unknown): YulaToolPartInfo | null {
  const p = part as Record<string, unknown> | null;
  if (!p || typeof p !== "object") return null;

  // 0. Vercel AI SDK tool-invocation format: { type: "tool-invocation", toolInvocation: { toolName, toolCallId, args, result, state } }
  if (p.type === "tool-invocation") {
    const inv = (p.toolInvocation && typeof p.toolInvocation === "object" ? p.toolInvocation : p) as Record<string, unknown>;
    const toolName = String(inv.toolName || p.toolName || "") as YulaToolName;
    if (toolName) {
      const toolCallId = String(inv.toolCallId || p.toolCallId || p.id || `tc_${toolName}`);
      const rawOutput = inv.result ?? inv.output ?? p.result ?? p.output;
      const rawInput = inv.args ?? inv.input ?? inv.arguments ?? p.args ?? p.input;
      const state = normalizeToolState(inv.state ?? p.state, rawOutput !== undefined);
      return {
        toolName,
        state,
        toolCallId,
        input: rawInput,
        output: rawOutput,
        errorText: typeof inv.errorText === "string" ? inv.errorText : typeof p.errorText === "string" ? p.errorText : undefined,
      };
    }
  }

  // 1. Canonical / Core format: { tool: "ask_user_choice", input, output, ... }
  if (isCanonicalToolPart(p)) {
    const toolName: YulaToolName = p.tool;
    const toolCallId = String(p.toolCallId || p.id || `tc_${toolName}`);
    const rawOutput = p.output ?? p.result;
    const rawInput = p.input ?? p.args ?? p.arguments;
    const state = normalizeToolState(p.state, rawOutput !== undefined);
    return {
      toolName,
      state,
      toolCallId,
      input: rawInput,
      output: rawOutput,
      errorText: typeof p.errorText === "string" ? p.errorText : undefined,
    };
  }

  // 2. Direct toolName format: { toolName: "ask_user_choice", ... }
  if (typeof p.toolName === "string" && p.toolName.length > 0 && p.type !== "dynamic-tool") {
    const toolName = p.toolName;
    const toolCallId = String(p.toolCallId || p.id || `tc_${toolName}`);
    const rawOutput = p.output ?? p.result;
    const rawInput = p.input ?? p.args ?? p.arguments;
    const state = normalizeToolState(p.state, rawOutput !== undefined);
    return {
      toolName,
      state,
      toolCallId,
      input: rawInput,
      output: rawOutput,
      errorText: typeof p.errorText === "string" ? p.errorText : undefined,
    };
  }

  // 3. Vercel AI SDK dynamic-tool
  if (p.type === "dynamic-tool") {
    const q = p as Record<string, unknown>;
    const toolName = typeof q.toolName === "string" ? q.toolName : "";
    if (toolName && q.toolCallId) {
      const rawOutput = q.output ?? q.result;
      const rawInput = q.input ?? q.args ?? q.arguments;
      return {
        toolName,
        state: normalizeToolState(q.state, rawOutput !== undefined),
        toolCallId: String(q.toolCallId),
        input: rawInput,
        output: rawOutput,
        errorText: typeof q.errorText === "string" ? q.errorText : undefined,
      };
    }
    return null;
  }

  // 4. Vercel AI SDK tool-<name>
  if (typeof p.type === "string" && p.type.startsWith("tool-")) {
    const q = p as Record<string, unknown>;
    if ("toolCallId" in q || "id" in q) {
      const toolCallId = String(q.toolCallId || q.id || `tc_${p.type}`);
      const rawOutput = q.output ?? q.result;
      const rawInput = q.input ?? q.args ?? q.arguments;
      return {
        toolName: typeof q.toolName === "string" && q.toolName ? q.toolName : p.type.slice("tool-".length),
        state: normalizeToolState(q.state, rawOutput !== undefined),
        toolCallId,
        input: rawInput,
        output: rawOutput,
        errorText: typeof q.errorText === "string" ? q.errorText : undefined,
      };
    }
  }

  // 5. Tool Call / Tool Result (AI SDK v5 / agent-core format)
  if (p.type === "tool-call" || p.type === "tool_call" || p.type === "tool-result" || p.type === "toolResult") {
    const toolName = String(p.toolName || p.name || "");
    if (toolName) {
      const toolCallId = String(p.toolCallId || p.id || `tc_${toolName}`);
      const rawOutput = p.output ?? p.result;
      const rawInput = p.input ?? p.args ?? p.arguments;
      const state = normalizeToolState(p.state, rawOutput !== undefined);
      return {
        toolName,
        state,
        toolCallId,
        input: rawInput,
        output: rawOutput,
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

export const FAILED_TOOL_STATUSES = [
  "error",
  "validation-error",
  "blocked",
] as const;

export type FailedToolStatus = (typeof FAILED_TOOL_STATUSES)[number];

export type ToolStatus =
  | "ok"
  | "executed"
  | "skipped"
  | FailedToolStatus;

export interface ToolErrorPayload {
  status?: FailedToolStatus | string;
  error?: string;
  message?: string;
  hint?: string;
  errors?: string[];
  [key: string]: unknown;
}

export function isFailedToolStatus(status: unknown): status is FailedToolStatus {
  return (
    typeof status === "string" &&
    (FAILED_TOOL_STATUSES as readonly string[]).includes(status)
  );
}

export function isToolErrorPayload(val: unknown): val is ToolErrorPayload {
  if (typeof val !== "object" || val === null) return false;
  const record = val as Record<string, unknown>;
  if (typeof record.error === "string" && record.error.trim().length > 0) {
    return true;
  }
  return isFailedToolStatus(record.status);
}

/**
 * Extracts human-readable error text from tool output or details.
 */
export function extractToolErrorMessage(output: unknown): string | null {
  if (!output) return null;
  if (typeof output === "string") {
    const trimmed = output.trim();
    if (trimmed.startsWith("{")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (typeof parsed === "object" && parsed !== null) {
          if (parsed.status === "ok" || parsed.status === "executed" || parsed.status === "skipped") {
            return null;
          }
          if (typeof parsed.error === "string" && parsed.error.trim().length > 0) return parsed.error;
          if (isFailedToolStatus(parsed.status) && typeof parsed.message === "string") {
            return parsed.message;
          }
        }
      } catch {
        // ignore parse error
      }
    }
    return output;
  }
  if (typeof output === "object" && output !== null) {
    const obj = output as Record<string, unknown>;
    if (typeof obj.error === "string" && obj.error.trim().length > 0) return obj.error;
    if (isFailedToolStatus(obj.status) && typeof obj.message === "string" && obj.message) {
      return obj.message;
    }
    if (obj.details && typeof obj.details === "object" && obj.details !== null) {
      const det = obj.details as Record<string, unknown>;
      if (typeof det.error === "string" && det.error.trim().length > 0) return det.error;
      if (isFailedToolStatus(det.status) && typeof det.message === "string" && det.message) {
        return det.message;
      }
    }
    if (Array.isArray(obj.content) && obj.content.length > 0) {
      for (const item of obj.content) {
        if (item && typeof item === "object" && typeof (item as any).text === "string") {
          const txt = (item as any).text.trim();
          if (txt.startsWith("{")) {
            try {
              const parsed = JSON.parse(txt);
              if (parsed && typeof parsed === "object") {
                if (parsed.status === "ok" || parsed.status === "executed" || parsed.status === "skipped") {
                  continue;
                }
                if (typeof parsed.error === "string" && parsed.error.trim().length > 0) return parsed.error;
                if (isFailedToolStatus(parsed.status) && typeof parsed.message === "string" && parsed.message) {
                  return parsed.message;
                }
              }
            } catch {
              // ignore
            }
          }
        }
      }
    }
  }
  return null;
}

export function isFailedToolInfo(info: YulaToolPartInfo): boolean {
  if (info.state === "output-error") return true;
  if (info.errorText) return true;
  if (info.state === "output-available" && info.output) {
    if (typeof info.output === "object" && info.output !== null) {
      const out = info.output as Record<string, unknown>;
      if (isFailedToolStatus(out.status)) {
        return true;
      }
      if (out.details && typeof out.details === "object" && out.details !== null) {
        const detStatus = (out.details as Record<string, unknown>).status;
        if (isFailedToolStatus(detStatus)) {
          return true;
        }
      }
    }
    const errMsg = extractToolErrorMessage(info.output);
    if (errMsg) return true;
  }
  return false;
}
