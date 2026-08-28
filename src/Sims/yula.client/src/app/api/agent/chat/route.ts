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

/** Provider singleton — base URL sabit; model adı çağrı başına seçilir.
 *  KEEP-ALIVE: ollama-ai-provider-v2 chat yolu keep_alive göndermediği için
 *  fetch middleware'i gövdeye enjekte eder. Ollama varsayılanı 5 dk boşta
 *  modeli bellekten attığı için ilk mesaj 10-60 sn yükleme bekler; 30 m ile
 *  sonraki mesajlar hızlı kalır (OLLAMA_KEEP_ALIVE ile değiştirilebilir). */
const OLLAMA_KEEP_ALIVE = process.env.OLLAMA_KEEP_ALIVE ?? "30m";

const ollama = createOllama({
  baseURL: `${process.env.OLLAMA_URL ?? DEFAULT_OLLAMA_URL}/api`,
  fetch: async (input, init) => {
    try {
      if (typeof init?.body === "string") {
        const body = JSON.parse(init.body) as Record<string, unknown>;
        if (body.model && body.keep_alive === undefined) {
          body.keep_alive = OLLAMA_KEEP_ALIVE;
          init = { ...init, body: JSON.stringify(body) };
        }
      }
    } catch {
      // Gövde JSON değilse olduğu gibi geçir
    }
    return fetch(input, init);
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
  // Güvenlik/hijyen: istemciden gelen model adına körlemesine güvenilmez;
  // Ollama'da gerçekten mevcut değilse varsayılana düş.
  if (!requested || requested === DEFAULT_MODEL) return DEFAULT_MODEL;
  const names = await availableModels();
  return names.includes(requested) ? requested : DEFAULT_MODEL;
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }

  const { messages, model, context } = (body ?? {}) as {
    messages?: YulaMessage[];
    model?: string;
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

  const systemPrompt = buildSystemPrompt(context);

  // Token bütçesi telemetrisi — prompt şişmesini izlenebilir kılar
  console.info(
    `[Yula AI] system: ${systemPrompt.length} chars (≈${Math.round(systemPrompt.length / 3.4)} tok) · tools: ${Object.keys(tools).length} · phase: ${phase}`,
  );

  const result = streamText({
    // Harmony kanal tokenlarını (`<|channel|>analysis|final<|message|>`) ayrıştır:
    // düşünme → reasoning part, cevap → text. (Bozuk şablonlu modeller için)
    model: wrapLanguageModel({
      model: ollama(await resolveModel(model)),
      middleware: [harmonyReasoningMiddleware(), yulaCachingMiddleware()],
    }),
    // Ollama varsayılan bağlam penceresi (≈4k) küçük: uzun sohbetlerde geçmiş
    // SESSİZCE kesilir. 8k sabit — taşarsa transport inceleticisi devrede.
    providerOptions: {
      ollama: { options: { num_ctx: YULA_NUM_CTX } },
      anthropic: { cacheControl: { type: "ephemeral" } },
    },
    system: buildSystemPrompt(context),
    messages: await convertToModelMessages(messages),
    tools,
    // Cookbook deseni: en fazla N adımlı araç döngüsü — ekran güncelleyen
    // araçlardan (set_grid_query, filter_current_grid) sonra 2-4sn gereksiz
    // LLM özet turu beklenmez; akış anında tamamlanır.
    stopWhen: [
      isStepCount(6),
      hasToolCall(
        "set_grid_query",
        "filter_current_grid",
        "visualize_grid_data",
        "run_report",
      ),
    ],
  });

  // Cookbook'un createUIMessageStreamResponse+toUIMessageStream zincirinin
  // resmi kısayolu — birebir aynı UI-message wire formatını üretir.
  return result.toUIMessageStreamResponse();
}
