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
import { type StandardAgentTools, STANDARD_AGENT_TOOLS } from "@/lib/yula-server-tools";
import { buildSystemPrompt, type YulaScreenContext } from "@/lib/yula-agent-prompt";
import { serverPlaybookService, serverPlaybookStorage } from "@/lib/playbook-server";
import { yulaCachingMiddleware } from "@/lib/yula-caching-middleware";
import { prepareStepRouting } from "@/lib/yula-step-router";
import { createFailoverLanguageModel } from "@/lib/yula-provider-failover";
import { slimMessagesForTransport, normalizeUIMessagesForTransport } from "@/lib/context-slim";
import {
  getYulaLanguageModel,
  getYulaProviderInfo,
  getAvailableProviderModels,
} from "@/lib/yula-provider";
import { getDefaultModel, resolveProvider, resolveThinkingEnabled } from "@/lib/yula-config";
import {
  effortToOllamaThink,
  effortToReasoning,
  normalizeEffort,
  resolveEffort,
  thinkingToEffort,
  type YulaEffort,
} from "@/lib/yula-reasoning";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Paylaşılan mesaj tipi — standart @my-agent/core araç setiyle
 * uçtan uca tip güvenliği.
 */
export type YulaTools = InferUITools<StandardAgentTools>;
/** Per-message metadata: token usage attached at step finish and wiki procedural memory scope. */
export type YulaMessageMetadata = {
  usage?: LanguageModelUsage;
  wiki?: {
    level: "system" | "workspace" | "user";
    workspaceId: string;
    targetPath?: string;
    rulesCount: number;
    rules: string[];
    recipesCount?: number;
  };
};
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
  if (provider === "agnes") {
    // Agnes: image_url girdisi + tool-calling destekler (cid7).
    return true;
  }
  if (provider === "azure" || provider === "openai") {
    return !lower.includes("o1-mini") && !lower.includes("o3-mini");
  }
  return (
    lower.includes("gpt-4") ||
    lower.includes("gpt-5") ||
    lower.includes("gemini") ||
    lower.includes("vision") ||
    lower.includes("vl") ||
    lower.includes("pixtral") ||
    lower.includes("paligemma") ||
    lower.includes("llava") ||
    lower.includes("bakllava") ||
    lower.includes("moondream") ||
    lower.includes("minicpm-v") ||
    lower.includes("cloud")
  );
}

function extractRawUrlOrData(p: { data?: unknown; url?: unknown; image?: unknown }): string | null {
  if (typeof p.data === "string") return p.data;
  if (p.data && typeof p.data === "object" && "url" in p.data) {
    const u = (p.data as { url: unknown }).url;
    return typeof u === "string" ? u : u != null ? String(u) : null;
  }
  if (typeof p.url === "string") return p.url;
  if (p.url && typeof p.url === "object") return String(p.url);
  if (typeof p.image === "string") return p.image;
  return null;
}

async function prepareModelMessages(
  rawMessages: YulaMessage[],
  activeModel: string,
  provider: ReturnType<typeof resolveProvider>,
) {
  const supportsVision = isModelVisionCapable(activeModel, provider);
  const normalized = normalizeUIMessagesForTransport(rawMessages);
  const modelMessages = await convertToModelMessages(
    slimMessagesForTransport(normalized),
  );

  return modelMessages.map((msg) => {
    if (msg.role !== "user" || !Array.isArray(msg.content)) return msg;

    const content: Array<Record<string, unknown>> = [];

    (msg.content as unknown[]).forEach((part) => {
      let imageBuffer: Buffer | null = null;
      let imageUrl: URL | null = null;
      let mimeType = "image/jpeg";

      const p = part as {
        type?: string;
        data?: unknown;
        url?: unknown;
        image?: unknown;
        mimeType?: string;
        mediaType?: string;
      };

      if (p.type === "file") {
        const raw = extractRawUrlOrData(p);
        const mime = p.mimeType || p.mediaType || "image/jpeg";
        if (raw && (mime.startsWith("image/") || raw.startsWith("data:image/"))) {
          if (raw.startsWith("data:")) {
            const base64Data = raw.includes(",") ? raw.split(",")[1] : raw;
            if (base64Data) {
              imageBuffer = Buffer.from(base64Data, "base64");
              mimeType = raw.split(";")[0]?.replace("data:", "") || mime;
            }
          } else if (raw.startsWith("http://") || raw.startsWith("https://")) {
            imageUrl = new URL(raw);
            mimeType = mime;
          }
        }
      } else if (p.type === "image") {
        if (typeof p.image === "string") {
          const raw = p.image;
          if (raw.startsWith("http://") || raw.startsWith("https://")) {
            imageUrl = new URL(raw);
            mimeType = p.mimeType || "image/jpeg";
          } else {
            const base64Data = raw.includes(",") ? raw.split(",")[1] : raw;
            if (base64Data) {
              imageBuffer = Buffer.from(base64Data, "base64");
              mimeType = p.mimeType || "image/jpeg";
            }
          }
        } else if (Buffer.isBuffer(p.image)) {
          imageBuffer = p.image as Buffer;
          mimeType = p.mimeType || "image/jpeg";
        }
      }

      if (imageBuffer || imageUrl) {
        if (supportsVision) {
          content.push({
            type: "image",
            image: imageBuffer ?? imageUrl!,
            mimeType,
          });
        } else {
          content.push({
            type: "text",
            text: `\n[Image attached: The active "${activeModel}" model has no vision capability. Please select a vision-capable model to inspect images.]`,
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

    const { messages, model, thinkingEnabled, effort: requestedEffort, context, uiContext, provider: requestedProvider, endpoint } =
      (body ?? {}) as {
        messages?: YulaMessage[];
        model?: string;
        thinkingEnabled?: boolean;
        effort?: YulaEffort | string;
        context?: YulaScreenContext;
        uiContext?: import("@my-agent/core").UIContextSnapshot;
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

    const effectivePathname = context?.pathname || uiContext?.route || "/";
    const effectivePhase =
      context?.phase ??
      (uiContext?.active_components?.some((c: any) => c.id === "result_grid:active" || c.id.startsWith("result_grid"))
        ? "results"
        : "workspace");
    const phase = effectivePhase;

    // Standart Headless React UI-Agent (@my-agent/core) araç seti
    const tools = { ...STANDARD_AGENT_TOOLS };
    const toolNames = Object.keys(tools);

    const isThinking = resolveThinkingEnabled(thinkingEnabled);
    // Efor önceliği: ajan pini > istek > eski boolean bayrak. Cookbook deseni:
    // taşınabilir top-level `reasoning` kullanılır, providerOptions ile aynı
    // anda reasoning yazılmaz (precedence çakışması olur).
    const agentEffort = normalizeEffort(
      (context?.agent as { effort?: unknown } | null | undefined)?.effort ?? "",
    );
    const bodyEffort =
      normalizeEffort(requestedEffort ?? "") ?? thinkingToEffort(thinkingEnabled);
    const effort = resolveEffort({
      agentEffort,
      requestEffort: bodyEffort,
      defaultEffort: isThinking ? "low" : "off",
    });
    // Aktif rota ve çalışma alanına ait doğrulanmış Playbook kurallarını ve reçetelerini getir (0 ms discovery)
    let playbookRules = context?.playbookRules;
    let playbookRecipes = context?.playbookRecipes;
    const wsId = context?.workspaceId || (effectivePathname.split("/")[1] || "stock");
    if (!playbookRules || !playbookRecipes) {
      try {
        if (!playbookRules) {
          playbookRules = await serverPlaybookService.getScreenRules(effectivePathname, wsId);
        }
        if (!playbookRecipes) {
          const entries = await serverPlaybookStorage.readEntries(wsId);
          playbookRecipes = entries
            .filter((e) => e.category === "workflow_recipe")
            .map((e) => ({
              title: e.title,
              summary: e.contentMarkdown.split("\n")[0]?.slice(0, 100) || e.title,
            }));
        }
      } catch {
        // Playbook okuma başarısız olursa kesintisiz devam et
      }
    }

    // Araç çağrısı yalnız streamText({ tools }) ile gider (AI SDK). Prompt'a
    // "<think> sonra araç yaz" demek Qwen/Harmony'nin to=functions metnini basmasına yol açar.
    const systemPrompt = buildSystemPrompt({
      ...context,
      pathname: effectivePathname,
      phase: effectivePhase,
      uiContext,
      playbookRules: playbookRules && playbookRules.length > 0 ? playbookRules : context?.playbookRules,
      playbookRecipes: playbookRecipes && playbookRecipes.length > 0 ? playbookRecipes : context?.playbookRecipes,
    });

    // Çıkarım önceliği: ajan sabiti > sohbet modeli > sağlayıcı varsayılanı.
    // resolveModel listede bulamazsa sağlayıcı varsayılanına düşer.
    const activeModel = await resolveModel(
      context?.agent?.model || model,
      provider,
      baseUrl,
    );
    const providerInfo = getYulaProviderInfo(provider);
    const primaryLanguageModel = getYulaLanguageModel(activeModel, {
      provider,
      baseUrl,
    });
    const fallbackProvider = provider === "azure" ? "openai" : provider === "openai" ? "agnes" : undefined;
    const fallbackLanguageModel = fallbackProvider && process.env.OPENAI_API_KEY
      ? getYulaLanguageModel(undefined, { provider: fallbackProvider })
      : undefined;

    const languageModel = createFailoverLanguageModel({
      primary: primaryLanguageModel,
      fallback: fallbackLanguageModel,
      onFailover: (err, step) => {
        console.warn(`⚠️ [Yula Failover]: Primary provider failed during ${step}, falling back to ${fallbackProvider}. Error:`, err);
      },
    });

    // Capability gate: efor desteklemeyen modelde reasoning/think gönderilmez
    // (desteklenmeyen modelde API hatası / coercion uyarısı vermemek için).
    // resolveModel zaten liste içinden seçti; yetenek aynı listeden okunur.
    let reasoning = effortToReasoning(effort);
    let ollamaThink: boolean | string | undefined;
    if (provider === "ollama") {
      ollamaThink = effortToOllamaThink(effort, activeModel);
    }
    try {
      const listed = await getAvailableProviderModels({ provider, baseUrl });
      const cap = listed.find(
        (m) => m.name === activeModel || m.name.toLowerCase() === activeModel.toLowerCase(),
      );
      const supported = Boolean(cap?.capabilities?.hasThinking ?? cap?.hasThinking);
      if (!supported) {
        reasoning = undefined;
        ollamaThink = undefined;
      }
    } catch {
      // Liste alınamazsa hesaplanan değerle devam (best-effort).
    }

    // Token bütçesi ve sağlayıcı telemetrisi
    console.info(
      `[Yula AI] provider: ${providerInfo.provider} · model: ${activeModel} · system: ${systemPrompt.length} chars (≈${Math.round(systemPrompt.length / 3.4)} tok) · tools: ${Object.keys(tools).length} · phase: ${phase} · thinking: ${isThinking} · effort: ${effort}${reasoning ? "" : " (n/a)"}`,
    );

    const middleware = [
      extractReasoningMiddleware({ tagName: "think" }),
      yulaCachingMiddleware(),
    ];

    const modelMessages = await prepareModelMessages(messages, activeModel, provider);

    const hasImageInMessages = modelMessages.some(
      (m) => Array.isArray(m.content) && m.content.some((p) => p.type === "image"),
    );

    const activeToolNames = hasImageInMessages ? [] : toolNames;

    const result = streamText({
      model: wrapLanguageModel({
        model: languageModel as any,
        middleware,
      }),
      ...(reasoning ? { reasoning } : {}),
      providerOptions: {
        anthropic: { cacheControl: { type: "ephemeral" } },
        ...(provider === "ollama" && ollamaThink !== undefined
          ? { ollama: { think: ollamaThink } }
          : {}),
      },
      system: systemPrompt,
      messages: modelMessages,
      tools,
      prepareStep: async ({ messages, stepNumber }) => {
        const result = prepareStepRouting({
          phase,
          stepNumber,
          toolNames: activeToolNames,
          hasImageInMessages,
          messages,
          compactionBudget: COMPACTION_TOKEN_BUDGET,
        });

        if (result.compactedMessages) {
          console.info(
            `🤖 [Yula Compaction]: step ${stepNumber} over budget; messages pruned to ~${estimateMessagesTokens(result.compactedMessages)} tok.`,
          );
        }

        return {
          activeTools: result.activeTools as Extract<keyof typeof tools, string>[],
          messages: result.compactedMessages,
        };
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
        hasToolCall("ask_user_choice"),
      ],
    });

    const wikiInfo: YulaMessageMetadata["wiki"] = {
      level: "workspace",
      workspaceId: wsId,
      targetPath: effectivePathname,
      rulesCount: playbookRules?.length ?? 0,
      rules: playbookRules ?? [],
    };

    const uiStream = toUIMessageStream<typeof tools, YulaMessage>({
      stream: result.stream,
      onError(error) {
        console.error("🤖 [Yula Stream Serialization Error Details]:", error);
        return error instanceof Error ? error.message : "AI Stream Error";
      },
      messageMetadata: ({ part }) => {
        if (part.type === "finish-step") {
          return {
            usage: part.usage,
            wiki: wikiInfo,
          };
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
