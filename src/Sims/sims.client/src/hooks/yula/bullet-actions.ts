/**
 * Asistan selamlama/öneri metinlerindeki madde satırlarını tıklanabilir
 * aksiyonlara çevirir.
 *
 * Sözleşme (system prompt md.6-viewing ile birebir):
 *   - **Kısa Başlık:** kullanıcının aynen gönderebileceği somut istek cümlesi
 *
 * Madde işaretçileri: ● • - *. Tıklandığında `request` olduğu gibi sendPrompt'e
 * verilir; böylece örnek cümle birebir kullanılır (model yeniden yorumlamaz).
 */

export interface BulletAction {
  title: string;
  request: string;
}

export type TextSegment =
  | { type: "text"; value: string }
  | { type: "actions"; actions: BulletAction[] };

const BULLET_RE = /^\s*[●•*\-]\s+\*\*(.+?)\*\*:?\s*(.+)$/;

/** Metni düz satırlar ve ardışık aksiyon-madde gruplarına böler. */
export function parseBulletActions(text?: string): TextSegment[] {
  const segments: TextSegment[] = [];
  if (!text) return segments;

  let plain: string[] = [];
  let pending: BulletAction[] = [];

  const flushText = () => {
    if (plain.length) {
      segments.push({ type: "text", value: plain.join("\n") });
      plain = [];
    }
  };
  const flushActions = () => {
    if (pending.length) {
      segments.push({ type: "actions", actions: pending });
      pending = [];
    }
  };

  for (const line of text.split("\n")) {
    const m = line.match(BULLET_RE);
    if (m) {
      flushText();
      pending.push({ title: m[1]!.replace(/:\s*$/, "").trim(), request: m[2]!.trim() });
    } else {
      flushActions();
      plain.push(line);
    }
  }
  flushText();
  flushActions();
  return segments;
}
