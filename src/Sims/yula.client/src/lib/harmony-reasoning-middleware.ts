/**
 * Harmony (kanal) formatı ayrıştırma middleware'i — saf modül.
 *
 * Bazı modeller/chat-template uyumsuzluklarında akış düz metne sızan kontrol
 * tokenları içerir: `<|channel|>analysis<|message|>...düşünme...<|end|>` ve
 * `<|channel|>final<|message|>...cevap...`. Bu middleware (AI SDK
 * `extractReasoningMiddleware` deseniyle) sızan segmentleri yakalayıp
 * düşünme içeriğini `reasoning` parçasına, cevabı `text` parçasına yönlendirir.
 * Tolerans: boru atlanmış varyantlar (`<channel|>`, `<message|>`) da yakalanır.
 */
import type { LanguageModelMiddleware } from "ai";

type MarkerKind = "reasoning" | "text" | "skip";

interface HarmonyMarker {
  kind: MarkerKind;
  token: string;
}

const CHANNEL_STARTS = ["<|channel|>", "<channel|>"] as const;
const MESSAGE_STARTS = ["<|message|>", "<message|>"] as const;
const REASONING_CHANNELS = ["analysis", "thinking", "thought"] as const;
const TEXT_CHANNELS = ["final", "answer", "commentary"] as const;
const SKIP_TOKENS = [
  "<|end|>",
  "<end|>",
  "<|start|>assistant",
  "<start|>assistant",
  "<|start|>",
  "<start|>",
] as const;

const DIRECT_REASONING_TAGS = ["<think>", "<thinking>", "<thought>", "<reasoning>", "<analysis>"] as const;
const DIRECT_TEXT_TAGS = ["</think>", "</thinking>", "</thought>", "</reasoning>", "</analysis>"] as const;

const MARKERS: HarmonyMarker[] = (() => {
  const markers: HarmonyMarker[] = [];
  for (const tag of DIRECT_REASONING_TAGS) {
    markers.push({ kind: "reasoning", token: tag });
  }
  for (const tag of DIRECT_TEXT_TAGS) {
    markers.push({ kind: "text", token: tag });
  }
  for (const cs of CHANNEL_STARTS) {
    for (const name of REASONING_CHANNELS) {
      for (const ms of MESSAGE_STARTS) {
        markers.push({ kind: "reasoning", token: `${cs}${name}${ms}` });
      }
    }
    for (const name of TEXT_CHANNELS) {
      for (const ms of MESSAGE_STARTS) {
        markers.push({ kind: "text", token: `${cs}${name}${ms}` });
      }
    }
  }
  for (const token of SKIP_TOKENS) {
    markers.push({ kind: "skip", token });
  }
  return markers;
})();

const MAX_MARKER_LEN = Math.max(...MARKERS.map((m) => m.token.length));

interface MarkerHit {
  marker: HarmonyMarker;
  index: number;
}

/** Buffer'daki EN ERKEN marker; aynı indekste en UZUN token kazanır. */
function findEarliestMarker(buffer: string): MarkerHit | null {
  let best: MarkerHit | null = null;
  for (const marker of MARKERS) {
    const index = buffer.indexOf(marker.token);
    if (index === -1) continue;
    if (
      best === null ||
      index < best.index ||
      (index === best.index && marker.token.length > best.marker.token.length)
    ) {
      best = { marker, index };
    }
  }
  return best;
}

/**
 * Buffer sonundaki, herhangi bir marker'ın ÖNEKİ olan uzunluğu.
 * (Chunk sınırlarında bölünmüş marker'ın erken basılmasını önler.)
 */
function partialPrefixLen(buffer: string): number {
  const max = Math.min(MAX_MARKER_LEN - 1, buffer.length);
  for (let len = max; len >= 1; len--) {
    const suffix = buffer.slice(-len);
    if (MARKERS.some((m) => m.token.startsWith(suffix))) return len;
  }
  return 0;
}

export type HarmonySegmentKind = "reasoning" | "text";

export interface HarmonySegment {
  kind: HarmonySegmentKind;
  text: string;
}

/**
 * Artımlı harmony ayrıştırıcı: push() deltasını segmentlere böler,
 * chunk sınırında bölünen marker'ı tamponlar; flush() kalanını boşaltır.
 */
export class HarmonyStreamParser {
  private mode: HarmonySegmentKind = "text";
  private buffer = "";

  push(delta: string): HarmonySegment[] {
    this.buffer += delta;
    const out: HarmonySegment[] = [];
    for (;;) {
      const hit = findEarliestMarker(this.buffer);
      if (!hit) break;
      if (hit.index > 0) {
        out.push({ kind: this.mode, text: this.buffer.slice(0, hit.index) });
      }
      this.buffer = this.buffer.slice(hit.index + hit.marker.token.length);
      if (hit.marker.kind !== "skip") this.mode = hit.marker.kind;
    }
    const keep = partialPrefixLen(this.buffer);
    const flushLen = this.buffer.length - keep;
    if (flushLen > 0) {
      out.push({ kind: this.mode, text: this.buffer.slice(0, flushLen) });
      this.buffer = this.buffer.slice(flushLen);
    }
    return out;
  }

  flush(): HarmonySegment[] {
    if (this.buffer.length === 0) return [];
    const out = [{ kind: this.mode, text: this.buffer } as HarmonySegment];
    this.buffer = "";
    return out;
  }
}

/** Tek seferlik (generate yolu) tam metin ayrıştırma. */
export function splitHarmonySegments(text: string): HarmonySegment[] {
  const parser = new HarmonyStreamParser();
  return [...parser.push(text), ...parser.flush()];
}

interface ParserEntry {
  parser: HarmonyStreamParser;
  pendingTextStart: { type: "text-start"; id: string } | null;
  reasoningStarted: boolean;
}

export function harmonyReasoningMiddleware(): LanguageModelMiddleware {
  return {
    specificationVersion: "v4",
    wrapGenerate: async ({ doGenerate }) => {
      const { content, ...rest } = await doGenerate();
      const transformed: typeof content = [];
      for (const part of content) {
        if (part.type !== "text") {
          transformed.push(part);
          continue;
        }
        for (const seg of splitHarmonySegments(part.text)) {
          if (seg.text.length === 0) continue;
          transformed.push(
            seg.kind === "reasoning"
              ? { type: "reasoning", text: seg.text }
              : { type: "text", text: seg.text },
          );
        }
      }
      return { content: transformed, ...rest };
    },
    wrapStream: async ({ doStream }) => {
      const { stream, ...rest } = await doStream();
      const entries = new Map<string, ParserEntry>();

      const getEntry = (id: string): ParserEntry => {
        let entry = entries.get(id);
        if (!entry) {
          entry = { parser: new HarmonyStreamParser(), pendingTextStart: null, reasoningStarted: false };
          entries.set(id, entry);
        }
        return entry;
      };

      const emitSegments = (
        entry: ParserEntry,
        textId: string,
        segments: HarmonySegment[],
        controller: TransformStreamDefaultController<unknown>,
      ) => {
        for (const seg of segments) {
          if (seg.text.length === 0) continue;
          if (seg.kind === "reasoning") {
            if (!entry.reasoningStarted) {
              entry.reasoningStarted = true;
              controller.enqueue({ type: "reasoning-start", id: `harmony-reasoning-${textId}` });
            }
            controller.enqueue({
              type: "reasoning-delta",
              id: `harmony-reasoning-${textId}`,
              delta: seg.text,
            });
          } else {
            if (entry.reasoningStarted) {
              controller.enqueue({ type: "reasoning-end", id: `harmony-reasoning-${textId}` });
              entry.reasoningStarted = false;
            }
            if (entry.pendingTextStart) {
              controller.enqueue(entry.pendingTextStart);
              entry.pendingTextStart = null;
            }
            controller.enqueue({ type: "text-delta", id: textId, delta: seg.text });
          }
        }
      };

      return {
        stream: stream.pipeThrough(
          new TransformStream({
            transform(chunk, controller) {
              if (chunk.type === "text-start") {
                const entry = getEntry(chunk.id);
                // text-start'ı bekle: ilk gerçek metin segmenti gelmeden basma
                // (başta reasoning varsa text part'ı boş açılmasın).
                entry.pendingTextStart = { type: "text-start", id: chunk.id };
                return;
              }
              if (chunk.type === "text-delta") {
                const entry = getEntry(chunk.id);
                emitSegments(entry, chunk.id, entry.parser.push(chunk.delta), controller);
                return;
              }
              if (chunk.type === "text-end") {
                const entry = getEntry(chunk.id);
                emitSegments(entry, chunk.id, entry.parser.flush(), controller);
                if (entry.reasoningStarted) {
                  controller.enqueue({ type: "reasoning-end", id: `harmony-reasoning-${chunk.id}` });
                  entry.reasoningStarted = false;
                }
                if (entry.pendingTextStart) {
                  controller.enqueue(entry.pendingTextStart);
                  entry.pendingTextStart = null;
                }
                controller.enqueue(chunk);
                entries.delete(chunk.id);
                return;
              }
              controller.enqueue(chunk);
            },
          }),
        ),
        ...rest,
      };
    },
  };
}
