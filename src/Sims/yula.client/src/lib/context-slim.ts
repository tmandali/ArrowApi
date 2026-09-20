/**
 * Transport-geçmişi inceltici — saf modül.
 *
 * SDK her istekte TÜM sohbeti gönderir; eski turların araç çıktıları
 * (50 satırlık rows dizileri, 2-3 KB'lık profil JSON'ları) geçmişte birikerek
 * her isteğin token yükünü lineer büyütür. Bu modül, İSTEK GİDEN KOPYADA
 * son turdan eski araç çıktılarını özet stub'a indirger:
 *   - `rows` dizileri atılır (ekrandaki kart gerçek veriyi zaten gösterir)
 *   - 800 karakteri aşan diğer çıktı nesneleri özetlenir
 *   - 16 mesajı aşan çok uzun sohbetlerde orta bölüm pencerelenir
 * Son asistan mesajı (güncel tur) olduğu gibi korunur; UI etkilenmez.
 */

const SLIM_CHAR_LIMIT = 800;

// Safety net limit for extreme conversations; fine-grained token compaction
// is handled dynamically by Vercel AI SDK's `pruneMessages` inside `prepareStepRouting`.
const MAX_TRANSPORT_MESSAGES = 64;

interface ToolLikePart {
  type?: string;
  state?: string;
  output?: unknown;
}

function isToolPart(part: unknown): part is ToolLikePart {
  const p = part as { type?: string } | null;
  return !!p?.type && (p.type === "dynamic-tool" || p.type.startsWith("tool-"));
}

function slimOutput(output: unknown): unknown {
  if (output === null || typeof output !== "object") return output;
  const out = output as Record<string, unknown>;
  const { rows, ...rest } = out;

  let result: Record<string, unknown> = Array.isArray(rows)
    ? { ...rest, rowsOmitted: rows.length }
    : { ...out };

  const jsonLen = JSON.stringify(result).length;
  if (jsonLen > SLIM_CHAR_LIMIT) {
    return {
      status: result.status ?? out.status ?? "ok",
      message:
        (result.message as string) ??
        (result.note as string) ??
        (out.message as string) ??
        "Özetlendi (bağlam tasarrufu)",
      rowsOmitted: Array.isArray(rows) ? rows.length : undefined,
      omitted: true,
    };
  }

  return result;
}

export interface SlimmableMessage {
  role: string;
  parts?: unknown[];
  content?: unknown;
}

/**
 * AI SDK'nın convertToModelMessages fonksiyonu her mesajda `parts` dizisi olmasını
 * şart koşar (dahili warnIfUIMessageHasDeprecatedRawInput doğrudan message.parts.some çağırır)
 * ve yalnızca 'system' | 'user' | 'assistant' rollerini destekler.
 *
 * Pi Code Agent döngüsünden gelen `role: 'toolResult'` mesajları, AI SDK UIMessage
 * modeline uygun şekilde önceki asistan mesajının `parts` dizisindeki ilgili araç
 * çağrısına (state: 'output-available', output: ...) katlanır (fold).
 */
export function normalizeUIMessagesForTransport<
  T extends SlimmableMessage,
>(rawMessages: T[] | undefined): T[] {
  if (!Array.isArray(rawMessages)) return [];

  // 1) toolResult mesajlarını toolCallId'ye göre indeksle
  const toolResultsByCallId = new Map<string, Record<string, unknown>>();
  for (const msg of rawMessages) {
    if (!msg || typeof msg !== "object") continue;
    const m = msg as Record<string, unknown>;
    const role = String(m.role || "").toLowerCase();
    if (role === "toolresult" || role === "tool_result" || role === "tool") {
      const callId = String(m.toolCallId || m.tool_call_id || m.id || "");
      if (callId) {
        toolResultsByCallId.set(callId, m);
      }
    }
  }

  // 2) Mesajları dönüştür; toolResult mesajlarını asistan parçalarına katlayıp listeden çıkar
  const folded: Record<string, unknown>[] = [];
  let lastAssistantMsg: Record<string, unknown> | null = null;

  for (let idx = 0; idx < rawMessages.length; idx++) {
    const msg = rawMessages[idx];
    if (!msg || typeof msg !== "object") {
      folded.push({
        id: `msg-${idx}`,
        role: "user",
        parts: [{ type: "text", text: String(msg ?? "") }],
      });
      continue;
    }

    const m = { ...(msg as Record<string, unknown>) };
    const rawRole = String(m.role || "user");
    const lowerRole = rawRole.toLowerCase();

    // Pi toolResult mesajı: asistan mesajına katlanacağı için ayrı mesaj olarak eklenmez
    if (lowerRole === "toolresult" || lowerRole === "tool_result" || lowerRole === "tool") {
      const callId = String(m.toolCallId || m.tool_call_id || m.id || "");
      const isError = Boolean(m.isError);
      const outputData = m.details ?? m.output ?? m.content ?? m.result;

      // İlgili veya en son asistan mesajının parçalarını güncelle
      if (lastAssistantMsg) {
        const parts = Array.isArray(lastAssistantMsg.parts)
          ? [...(lastAssistantMsg.parts as Record<string, unknown>[])]
          : [];
        let matched = false;

        for (let pi = 0; pi < parts.length; pi++) {
          const p = parts[pi];
          if (p && typeof p === "object" && String(p.toolCallId || "") === callId) {
            parts[pi] = {
              ...p,
              state: isError ? "output-error" : "output-available",
              ...(isError
                ? { errorText: String(m.content ?? "Araç yürütme hatası") }
                : { output: outputData }),
            };
            matched = true;
            break;
          }
        }

        if (!matched && callId) {
          // Asistan parçasında yoksa yeni parça olarak ekle
          parts.push({
            type: `tool-${m.toolName || "action"}`,
            toolCallId: callId,
            toolName: m.toolName || "action",
            input: m.args ?? m.arguments ?? {},
            state: isError ? "output-error" : "output-available",
            ...(isError
              ? { errorText: String(m.content ?? "Araç yürütme hatası") }
              : { output: outputData }),
          });
        }
        lastAssistantMsg.parts = parts;
      }
      continue;
    }

    const id = typeof m.id === "string" ? m.id : `msg-${idx}`;
    const role = lowerRole === "system" ? "system" : lowerRole === "assistant" ? "assistant" : "user";

    let parts: unknown[] = [];
    if (Array.isArray(m.parts)) {
      parts = [...m.parts];
    } else if (typeof m.content === "string" && m.content.trim()) {
      parts.push({ type: "text", text: m.content });
    } else if (Array.isArray(m.content)) {
      parts.push(...m.content);
    }

    const processedMsg: Record<string, unknown> = {
      ...m,
      id,
      role,
      parts,
    };

    if (role === "assistant") {
      lastAssistantMsg = processedMsg;
    }

    folded.push(processedMsg);
  }

  // 3) Geriye kalan asistan mesajlarındaki toolResult eşleşmelerini uygula
  if (toolResultsByCallId.size > 0) {
    for (const msg of folded) {
      if (msg.role !== "assistant" || !Array.isArray(msg.parts)) continue;
      msg.parts = msg.parts.map((p) => {
        if (!p || typeof p !== "object") return p;
        const part = p as Record<string, unknown>;
        const callId = String(part.toolCallId || "");
        if (callId && toolResultsByCallId.has(callId)) {
          const tr = toolResultsByCallId.get(callId)!;
          const isError = Boolean(tr.isError);
          const outputData = tr.details ?? tr.output ?? tr.content ?? tr.result;
          return {
            ...part,
            state: isError ? "output-error" : "output-available",
            ...(isError
              ? { errorText: String(tr.content ?? "Araç yürütme hatası") }
              : { output: outputData }),
          };
        }
        return p;
      });
    }
  }

  return folded as unknown as T[];
}

export function slimMessagesForTransport<
  T extends SlimmableMessage,
>(messages: T[]): T[] {
  if (!Array.isArray(messages) || messages.length === 0) return messages;
  const safeMessages = normalizeUIMessagesForTransport(messages);

  // 1) Çok uzun sohbetlerde kayan pencere (sliding window): İlk 2 mesaj (orijin) + Son N mesaj
  let windowedMessages = safeMessages;
  if (safeMessages.length > MAX_TRANSPORT_MESSAGES) {
    const head = safeMessages.slice(0, 2);
    const tail = safeMessages.slice(safeMessages.length - (MAX_TRANSPORT_MESSAGES - 2));
    windowedMessages = [...head, ...tail];
  }

  let lastAssistant = -1;
  windowedMessages.forEach((m, i) => {
    if (m.role === "assistant") lastAssistant = i;
  });

  return windowedMessages.map((message, i) => {
    if (message.role !== "assistant" || !Array.isArray(message.parts)) return message;

    let changed = false;
    const isLatest = i === lastAssistant;
    const parts = message.parts.map((part) => {
      if (!isToolPart(part)) return part;
      // SDK koruması: Herhangi bir araç çağrısı "input-available" durumunda kaldıysa
      // (ör. yanıtlanmamış onay kartı veya yarıda kesilmiş araç), transport kopyasında
      // state'i output-error'a çek ki AI SDK "Tool result is missing for tool call" hatası vermesin.
      if (part.state === "input-available" || !part.state) {
        changed = true;
        return {
          ...part,
          state: "output-error",
          errorText: "İşlem yanıtlanmadı veya kesintiye uğradı.",
        };
      }
      if (isLatest || part.state !== "output-available") return part;
      const slimmed = slimOutput(part.output);
      if (slimmed === part.output) return part;
      changed = true;
      return { ...part, output: slimmed };
    });
    return changed ? { ...message, parts } : message;
  });
}
