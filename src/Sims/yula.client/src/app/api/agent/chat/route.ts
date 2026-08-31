import {
  convertToModelMessages,
  hasToolCall,
  isStepCount,
  type InferUITools,
  type UIDataTypes,
  type UIMessage,
  streamText,
  wrapLanguageModel,
} from "ai";
import { type YulaStaticTools } from "@/lib/yula-server-tools";
import { createOllama } from "ollama-ai-provider-v2";
import { buildSystemPrompt, type YulaScreenContext } from "@/lib/yula-agent-prompt";
import { harmonyReasoningMiddleware } from "@/lib/harmony-reasoning-middleware";
import { yulaCachingMiddleware } from "@/lib/yula-caching-middleware";
import { buildServerTools } from "@/lib/yula-server-tools";
import { slimMessagesForTransport } from "@/lib/context-slim";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Paylaşılan mesaj tipi — cookbook deseni:
 * statik araçlar tipli (`tool-<ad>` parçaları), grid dinamikleri
 * `dynamic-tool` olarak akar ve istemci ikisini de destekler.
 */
export type YulaTools = InferUITools<YulaStaticTools>;
export type YulaMessage = UIMessage<never, UIDataTypes, YulaTools>;

const DEFAULT_OLLAMA_URL = "http://localhost:11434";
export const DEFAULT_MODEL = process.env.YULA_MODEL ?? "gemma4:12b-mlx";

/** Ollama bağlam penceresi — varsayılan 4k'da uzun sohbet sessizce kesilir */
const YULA_NUM_CTX = Number(process.env.YULA_NUM_CTX ?? 8192);

/** Provider singleton — base URL sabit; model adı çağrı başına seçilir. */
const OLLAMA_KEEP_ALIVE = process.env.OLLAMA_KEEP_ALIVE ?? "30m";

const ollama = createOllama({
  baseURL: `${process.env.OLLAMA_URL ?? DEFAULT_OLLAMA_URL}/api`,
  fetch: async (input, init) => {
    let bodyObj: Record<string, unknown> | null = null;
    try {
      if (typeof init?.body === "string") {
        bodyObj = JSON.parse(init.body) as Record<string, unknown>;
        if (bodyObj.model && bodyObj.keep_alive === undefined) {
          bodyObj.keep_alive = OLLAMA_KEEP_ALIVE;
          init = { ...init, body: JSON.stringify(bodyObj) };
        }
      }
    } catch {
      // Gövde JSON değilse olduğu gibi geçir
    }
    const res = await fetch(input, init);
    if (!res.ok) {
      const errText = await res.clone().text();
      console.error(`🤖 [Ollama API Error ${res.status}]:`, errText);
    }
    return res;
  },
});

let tagsCache: { names: string[]; at: number } | null = null;

async function availableModels(): Promise<string[]> {
  if (tagsCache && Date.now() - tagsCache.at < 60_000) return tagsCache.names;
  try {
    const res = await fetch(
      `${process.env.OLLAMA_URL ?? DEFAULT_OLLAMA_URL}/api/tags`,
      { cache: "no-store" },
    );
    const data = (await res.json()) as { models?: { name: string }[] };
    const names = (data.models ?? []).map((m) => m.name);
    tagsCache = { names, at: Date.now() };
    return names;
  } catch {
    return [];
  }
}

async function resolveModel(requested?: string): Promise<string> {
  const names = await availableModels();
  if (requested && names.includes(requested)) return requested;
  if (names.includes(DEFAULT_MODEL)) return DEFAULT_MODEL;
  if (names.length > 0) {
    console.info(
      `🤖 [Yula Model Fallback]: "${requested ?? DEFAULT_MODEL}" Ollama'da bulunamadı, aktif varsayılan seçildi: "${names[0]}"`,
    );
    return names[0];
  }
  return DEFAULT_MODEL;
}

function isModelVisionCapable(modelName: string): boolean {
  const lower = modelName.toLowerCase();
  return (
    lower.includes("vision") ||
    lower.includes("llava") ||
    lower.includes("bakllava") ||
    lower.includes("moondream") ||
    lower.includes("minicpm-v") ||
    lower.includes("cloud")
  );
}

async function prepareModelMessages(rawMessages: YulaMessage[], activeModel: string) {
  const supportsVision = isModelVisionCapable(activeModel);
  const modelMessages = await convertToModelMessages(
    slimMessagesForTransport(rawMessages),
  );

  return modelMessages.map((msg) => {
    if (msg.role !== "user" || !Array.isArray(msg.content)) return msg;

    const content: Array<Record<string, unknown>> = [];

    (msg.content as unknown[]).forEach((part) => {
      let imageBuffer: Buffer | null = null;
      let mimeType = "image/jpeg";

      const p = part as { type?: string; data?: unknown; url?: unknown; image?: unknown; mimeType?: string; mediaType?: string };

      if (p.type === "file") {
        const dataVal = p.data ?? p.url;
        const mime = p.mimeType || p.mediaType || "image/jpeg";
        if (typeof dataVal === "string" && (mime.startsWith("image/") || dataVal.startsWith("data:image/"))) {
          const base64Data = dataVal.includes(",") ? dataVal.split(",")[1] : dataVal;
          if (base64Data) {
            imageBuffer = Buffer.from(base64Data, "base64");
            mimeType = mime;
          }
        }
      } else if (p.type === "image") {
        if (typeof p.image === "string") {
          const dataStr = p.image;
          const base64Data = dataStr.includes(",") ? dataStr.split(",")[1] : dataStr;
          if (base64Data) {
            imageBuffer = Buffer.from(base64Data, "base64");
            mimeType = p.mimeType || "image/jpeg";
          }
        } else if (Buffer.isBuffer(p.image)) {
          imageBuffer = p.image as Buffer;
        }
      }

      if (imageBuffer) {
        if (supportsVision) {
          content.push({
            type: "image",
            image: imageBuffer,
            mimeType,
          });
        } else {
          content.push({
            type: "text",
            text: `\n[Görsel Eklendi: Yerel "${activeModel}" modeli görüntü işleme (Vision) sürücüsüne sahip değildir. Görsel okuma için lütfen Vision destekli bir model seçiniz.]`,
          });
        }
      } else {
        content.push(p as Record<string, unknown>);
      }
    });

    return { ...msg, content: content as unknown as typeof msg.content };
  });
}

export async function POST(req: Request) {
  try {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: "invalid json" }, { status: 400 });
    }

    const { messages, model, thinkingEnabled, context } = (body ?? {}) as {
      messages?: YulaMessage[];
      model?: string;
      thinkingEnabled?: boolean;
      context?: YulaScreenContext;
    };

    if (!Array.isArray(messages)) {
      return Response.json({ error: "messages required" }, { status: 400 });
    }

    // EVRE KAPISI — istemci phase bildirir; sunucu çift kontrol yapar:
    //   results          → yalnız grid araçları (columns doluysa)
    //   results-loading  → HİÇBİR araç (tablo hazır değil; run_report dahil yasak)
    //   workspace        → hazırla/çalıştır araçları
    const phase = context?.phase ?? "workspace";
    const grid = context?.grid ?? null;
    let tools: ReturnType<typeof buildServerTools>;
    if (phase === "results" && grid && grid.columns.length > 0) {
      tools = buildServerTools(grid);
    } else if (phase === "results-loading") {
      tools = {};
    } else {
      tools = buildServerTools(null);
    }

    const isThinking = thinkingEnabled !== false;
    let systemPrompt = buildSystemPrompt(context);
    if (!isThinking) {
      systemPrompt += "\n\n[DÜŞÜNME MODU (THINKING) KAPALI: Düşünme adımlarını (thinking/reasoning) atla. Doğrudan net yanıtı sun.]";
    }

    // Token bütçesi telemetrisi — prompt şişmesini izlenebilir kılar
    console.info(
      `[Yula AI] system: ${systemPrompt.length} chars (≈${Math.round(systemPrompt.length / 3.4)} tok) · tools: ${Object.keys(tools).length} · phase: ${phase} · thinking: ${isThinking}`,
    );

    const activeModel = await resolveModel(model);

    const middleware = isThinking
      ? [harmonyReasoningMiddleware(), yulaCachingMiddleware()]
      : [yulaCachingMiddleware()];

    const modelMessages = await prepareModelMessages(messages, activeModel);

    const hasImageInMessages = modelMessages.some(
      (m) => Array.isArray(m.content) && m.content.some((p) => p.type === "image"),
    );

    const activeTools = hasImageInMessages ? {} : tools;

    const result = streamText({
      model: wrapLanguageModel({
        model: ollama(activeModel),
        middleware,
      }),
      providerOptions: {
        ollama: { options: { num_ctx: YULA_NUM_CTX } },
        anthropic: { cacheControl: { type: "ephemeral" } },
      },
      system: systemPrompt,
      messages: modelMessages,
      tools: activeTools,
      onError({ error }) {
        console.error("🤖 [Yula AI Engine Error Details]:", error);
      },
      onFinish({ usage, finishReason }) {
        const u = usage as unknown as {
          promptTokens?: number;
          inputTokens?: number;
          completionTokens?: number;
          outputTokens?: number;
          totalTokens?: number;
        };
        const pTokens = u.promptTokens ?? u.inputTokens ?? 0;
        const cTokens = u.completionTokens ?? u.outputTokens ?? 0;
        const tTokens = u.totalTokens ?? pTokens + cTokens;
        console.info(
          `🤖 [Yula AI Telemetry]: Prompt Tokens: ${pTokens} · Completion Tokens: ${cTokens} · Total: ${tTokens} (Reason: ${finishReason})`
        );
      },
      stopWhen: [
        isStepCount(6),
        hasToolCall(
          "set_grid_query",
          "filter_current_grid",
          "visualize_grid_data",
          "run_report",
          "profile_grid_table",
          "analyze_grid_data",
          "run_expert_sql",
          "get_report_schema",
          "prepare_report_criteria",
          "request_user_confirmation",
        ),
      ],
    });

    return result.toUIMessageStreamResponse({
      onError(error) {
        console.error("🤖 [Yula Stream Serialization Error Details]:", error);
        return error instanceof Error ? error.message : "AI Stream Error";
      },
    });
  } catch (error) {
    console.error("🤖 [Yula API Route Unhandled Error]:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Internal AI Server Error" },
      { status: 500 },
    );
  }
}
