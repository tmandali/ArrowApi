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
const MAX_TRANSPORT_MESSAGES = 16;

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
}

export function slimMessagesForTransport<
  T extends SlimmableMessage,
>(messages: T[]): T[] {
  if (!Array.isArray(messages) || messages.length === 0) return messages;

  // 1) Çok uzun sohbetlerde kayan pencere (sliding window): İlk 2 mesaj (orijin) + Son N mesaj
  let windowedMessages = messages;
  if (messages.length > MAX_TRANSPORT_MESSAGES) {
    const head = messages.slice(0, 2);
    const tail = messages.slice(messages.length - (MAX_TRANSPORT_MESSAGES - 2));
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
