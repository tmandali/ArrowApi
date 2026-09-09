import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  extractReasoningMiddleware,
  hasToolCall,
  isStepCount,
  pruneMessages,
  toUIMessageStream,
  type InferUITools,
  type LanguageModelUsage,
  type UIDataTypes,
  type UIMessage,
  streamText,
  wrapLanguageModel,
} from "ai";
import { type YulaStaticTools, type ReportToolContext } from "@/lib/yula-server-tools";
import { findReport, REGISTERED_REPORTS } from "@/features/reports/report-registry";
import { buildSystemPrompt, type YulaScreenContext } from "@/lib/yula-agent-prompt";
import { filterActiveToolsByAgent } from "@/lib/yula-user-agent";
import { yulaCachingMiddleware } from "@/lib/yula-caching-middleware";
import { buildServerTools } from "@/lib/yula-server-tools";
import { slimMessagesForTransport } from "@/lib/context-slim";
import {
  getYulaLanguageModel,
  getYulaProviderInfo,
  getAvailableProviderModels,
} from "@/lib/yula-provider";
import { getDefaultModel, resolveProvider, resolveThinkingEnabled } from "@/lib/yula-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Paylaşılan mesaj tipi — cookbook deseni:
 * statik araçlar tipli (`tool-<ad>` parçaları), grid dinamikleri
 * `dynamic-tool` olarak akar ve istemci ikisini de destekler.
 */
export type YulaTools = InferUITools<YulaStaticTools>;
/** Per-message metadata: token usage attached at step finish (SDK recipe). */
export type YulaMessageMetadata = { usage?: LanguageModelUsage };
export type YulaMessage = UIMessage<YulaMessageMetadata, UIDataTypes, YulaTools>;

export const DEFAULT_MODEL = getDefaultModel();

/**
 * Context compaction (SDK recipe: track-agent-token-usage).
 * Rough token estimate; when the loop's message state exceeds the budget,
 * old tool I/O and reasoning are pruned while the last task turns stay intact.
 */
const COMPACTION_TOKEN_BUDGET =
  Number(process.env.YULA_COMPACTION_TOKENS) > 0
    ? Number(process.env.YULA_COMPACTION_TOKENS)
    : 50_000;

function estimateMessagesTokens(messages: unknown): number {
  try {
    return Math.ceil(JSON.stringify(messages).length / 4);
  } catch {
    return 0;
  }
}

async function resolveModel(
  requested: string | undefined,
  provider: ReturnType<typeof resolveProvider>,
  baseUrl?: string,
): Promise<string> {
  const models = await getAvailableProviderModels({ provider, baseUrl });
  const names = models.map((m) => m.name);
  if (requested && (names.includes(requested) || names.some((n) => n.toLowerCase() === requested.toLowerCase()))) {
    return requested;
  }
  const defaultModel = getDefaultModel(provider);
  if (names.includes(defaultModel)) return defaultModel;
  if (names.length > 0) {
    return names[0];
  }
  return defaultModel;
}

function isModelVisionCapable(
  modelName: string,
  provider: ReturnType<typeof resolveProvider>,
): boolean {
  const lower = modelName.toLowerCase();
  if (provider === "azure" || provider === "openai") {
    return !lower.includes("o1-mini") && !lower.includes("o3-mini");
  }
  return (
    lower.includes("gpt-4") ||
    lower.includes("gpt-5") ||
    lower.includes("vision") ||
    lower.includes("llava") ||
    lower.includes("bakllava") ||
    lower.includes("moondream") ||
    lower.includes("minicpm-v") ||
    lower.includes("cloud")
  );
}

async function prepareModelMessages(
  rawMessages: YulaMessage[],
  activeModel: string,
  provider: ReturnType<typeof resolveProvider>,
) {
  const supportsVision = isModelVisionCapable(activeModel, provider);
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

    const { messages, model, thinkingEnabled, context, provider: requestedProvider, endpoint } =
      (body ?? {}) as {
        messages?: YulaMessage[];
        model?: string;
        thinkingEnabled?: boolean;
        context?: YulaScreenContext;
        provider?: string;
        endpoint?: string;
      };
    const provider = resolveProvider(
      context?.agent?.provider || requestedProvider,
    );
    const baseUrl =
      typeof endpoint === "string" && endpoint.length > 0 ? endpoint : undefined;

    if (!Array.isArray(messages)) {
      return Response.json({ error: "messages required" }, { status: 400 });
    }

    // PHASE WALL (SDK-native): full set built once, prepareStep locks
    // per-step tools —
    //   results          → grid tools only (columns present)
    //   results-loading  → no tools (table not ready; run_job forbidden)
    //   workspace        → criteria/run tools only
    const phase = context?.phase ?? "workspace";
    const grid = context?.grid ?? null;
    const criteriaTools = buildServerTools(null);
    const gridTools =
      grid && grid.columns.length > 0 ? buildServerTools(grid) : null;
    const tools = { ...criteriaTools, ...(gridTools ?? {}) };
    const criteriaToolNames = Object.keys(criteriaTools);
    const gridToolNames = gridTools ? Object.keys(gridTools) : [];

    // Dynamic tool descriptions (SDK toolsContext): inject the active
    // report scope, title, and required criteria fields so the model
    // grounds tool choice without hardcoded report lists.
    const pathname = context?.pathname ?? "";
    const activeReport =
      REGISTERED_REPORTS.find((r) => pathname.startsWith(r.pagePath)) ??
      (context?.screen?.reportScope
        ? findReport(context.screen.reportScope)
        : undefined);
    const schemaRequired = (activeReport?.fullSchema as { required?: unknown })
      ?.required;
    const toolContext: ReportToolContext = {
      reportScope: activeReport?.scope ?? "stock-balance",
      reportTitle: activeReport?.title ?? "report",
      requiredFields: Array.isArray(schemaRequired)
        ? (schemaRequired as unknown[]).filter(
            (f): f is string => typeof f === "string",
          )
        : [],
      availableReports: REGISTERED_REPORTS.map((r) => r.scope).join(", "),
    };
    const toolsContext = {
      run_job: toolContext,
      apply_criteria: toolContext,
      open_last_report: toolContext,
      find_matching_report: toolContext,
    };

    const isThinking = resolveThinkingEnabled(thinkingEnabled);
    // Araç çağrısı yalnız streamText({ tools }) ile gider (AI SDK). Prompt'a
    // "<think> sonra araç yaz" demek Qwen/Harmony'nin to=functions metnini basmasına yol açar.
    const systemPrompt = buildSystemPrompt(context);

    // Çıkarım önceliği: ajan sabiti > sohbet modeli > sağlayıcı varsayılanı.
    // resolveModel listede bulamazsa sağlayıcı varsayılanına düşer.
    const activeModel = await resolveModel(
      context?.agent?.model || model,
      provider,
      baseUrl,
    );
    const providerInfo = getYulaProviderInfo(provider);
    const languageModel = getYulaLanguageModel(activeModel, {
      provider,
      baseUrl,
    });

    // Token bütçesi ve sağlayıcı telemetrisi
    console.info(
      `[Yula AI] provider: ${providerInfo.provider} · model: ${activeModel} · system: ${systemPrompt.length} chars (≈${Math.round(systemPrompt.length / 3.4)} tok) · tools: ${Object.keys(tools).length} · phase: ${phase} · thinking: ${isThinking}`,
    );

    const middleware = [
      extractReasoningMiddleware({ tagName: "think" }),
      yulaCachingMiddleware(),
    ];

    const modelMessages = await prepareModelMessages(messages, activeModel, provider);

    const hasImageInMessages = modelMessages.some(
      (m) => Array.isArray(m.content) && m.content.some((p) => p.type === "image"),
    );

    // SDK-native phase lock: only the current phase's tools are callable.
    const phaseToolNames =
      hasImageInMessages || phase === "results-loading"
        ? []
        : phase === "results" && gridToolNames.length > 0
          ? gridToolNames
          : criteriaToolNames;

    const result = streamText({
      model: wrapLanguageModel({
        model: languageModel,
        middleware,
      }),
      providerOptions: {
        anthropic: { cacheControl: { type: "ephemeral" } },
      },
      system: systemPrompt,
      messages: modelMessages,
      tools,
      toolsContext,
      prepareStep: async ({ messages, stepNumber }) => {
        // Ajan kapısı (Step 5/6 karşılığı): seçili ajan allowlist verdiyse
        // faz araçları onunla kesiştirilir; boş = tüm faz araçları.
        const agentTools = context?.agent?.tools;
        const gatedTools =
          agentTools && agentTools.length > 0
            ? filterActiveToolsByAgent(phaseToolNames, gridToolNames, agentTools)
            : phaseToolNames;
        const activeTools = gatedTools as Extract<
          keyof typeof tools,
          string
        >[];
        if (estimateMessagesTokens(messages) <= COMPACTION_TOKEN_BUDGET) {
          return { activeTools };
        }
        const compacted = pruneMessages({
          messages,
          reasoning: "all",
          toolCalls: "before-last-3-messages",
          emptyMessages: "remove",
        });
        console.info(
          `🤖 [Yula Compaction]: step ${stepNumber} over budget ` +
            `(~${estimateMessagesTokens(messages)} tok > ${COMPACTION_TOKEN_BUDGET}); ` +
            `pruned to ~${estimateMessagesTokens(compacted)} tok.`,
        );
        return { activeTools, messages: compacted };
      },
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
          "set_grid_sort",
          "configure_grid_columns",
          "pin_grid_columns",
          "apply_grid_filters",
          "reset_grid_layout",
          "export_grid_data",
          "visualize_grid_data",
          "run_job",
          "apply_criteria",
          "navigate_to_page",
          "open_last_report",
          "profile_grid_table",
          "analyze_grid_data",
          "run_expert_sql",
          "get_report_schema",
          "request_user_confirmation",
          "ask_user_question",
        ),
      ],
    });

    const uiStream = toUIMessageStream<typeof tools, YulaMessage>({
      stream: result.stream,
      onError(error) {
        console.error("🤖 [Yula Stream Serialization Error Details]:", error);
        return error instanceof Error ? error.message : "AI Stream Error";
      },
      messageMetadata: ({ part }) => {
        if (part.type === "finish-step") {
          return { usage: part.usage };
        }
      },
    });

    return createUIMessageStreamResponse({ stream: uiStream });
  } catch (error) {
    console.error("🤖 [Yula API Route Unhandled Error]:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Internal AI Server Error" },
      { status: 500 },
    );
  }
}
