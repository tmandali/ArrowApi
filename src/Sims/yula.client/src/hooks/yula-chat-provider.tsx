"use client";

import {
  useChat,
} from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import type { YulaMessage, YulaTools } from "@/app/api/agent/chat/route";
import {
  yulaToolPartInfo,
  isFailedToolInfo,
  SERVER_EXECUTED_TOOLS,
} from "@/lib/yula-tool-info";
import {
  YulaChatContext,
  type YulaChatContextValue,
} from "./yula-chat-context";
import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { executeClientTool, resetGridCustomView } from "@/lib/yula-client-tools";
import {
  blockedIncompleteIntent,
  hasExplicitReportRunIntent,
} from "@/lib/report-run-intent";
import {
  isWorkspaceHomePath,
  normalizePath,
  workspaceIdFromPath,
  workspaceLabelFromPath,
  isReportResultPath,
  extractJobIdFromHref,
  reportExecutionPath,
  extractAgentIdFromPath,
} from "@/lib/workspace-paths";
import {
  useChatsStore,
} from "@/lib/stores/chats";
import { useUserSkillsStore } from "@/lib/stores/user-skills";
import { BUILT_IN_USER_SKILLS } from "@/lib/built-in-skills";
import { getAllUserSkillsInventory, getEffectiveUserSkills } from "@/lib/yula-user-skill";
import { useUserAgentsStore } from "@/lib/stores/user-agents";
import { agentScopeWorkspaceId, filterAgentsByScope } from "@/lib/yula-user-agent";
import { navigateToConversationScreen, healConversationRecords } from "@/lib/yula-history-navigation";
import { queueYulaPrompt, takeQueuedYulaPrompt } from "@/lib/yula-pending-prompt";
import { clearTurnTrace, getTurnTrace, upsertTurnTrace } from "@/lib/yula-turn-trace";
import { isYulaGridSlashPrompt } from "@/components/layout/yula-commands";
import { useYulaGridStore } from "@/lib/stores/grid";
import { useYulaDockStore } from "@/lib/stores/dock";
import { useActiveJobsStore } from "@/store/slices/active-jobs-store";
import { useDraftCriteriaStore } from "@/store/slices/draft-criteria-store";
import { slimMessagesForTransport } from "@/lib/context-slim";
import {
  snapshotScreenState,
  diffScreenSnapshots,
  type ScreenSnapshot,
} from "@/lib/screen-snapshot";
import { extractWorkedSteps } from "@/components/layout/yula-worked-steps";
import { readYulaClientAiConfig, yulaModelsApiUrl } from "@/lib/yula-ai-client-config";

/**
 * Yula v2 — referans repo deseninin standart Next karşılığı.
 * Tek kaynak: ai-sdk `useChat` + zustand persist (konuşma geçmişi/model).
 *
 * Konuşma değişimi: dış sağlayıcı yalnız seçim durumunu okur,
 * içte anahtarlanmış (<ChatInstance key>) taze bir chat örneği kurulur;
 * böylece persist edilmiş mesajlar asla çalışan örneğe çift eklenmez.
 */



/**
 * SDK `sendAutomaticallyWhen` sözleşmesi (cookbook: call-tools, human-in-the-loop,
 * call-tools-multiple-steps) — SDK bu fonksiyonu İKİ anda çağırır:
 *   (a) her akış bittiğinde (ai Chat: `shouldSendAutomatically` finally bloğu),
 *   (b) addToolOutput ile çıktı eklendikten sonra.
 * True dönmesi → SDK geçmişi OLDUĞU GİBİ yeniden gönderir (resubmit).
 *
 * Canonical semantik (ai: lastAssistantMessageIsCompleteWithToolCalls):
 * yalnızca SON adım (son `step-start` sonrası) değerlendirilir. Tüm mesajı
 * taramak HATALIDIR: sunucu çok-adımlı yanıtta son cevabı metinle bitirirken
 * önceki adımlarda tamamlanmış araçlar bulunur; tüm-mesaj taraması cevap
 * verildikten sonra da resubmit tetikler → modelin aynı cevabı tekrar tekrar
 * yazmasına yol açar (sonsuz döngü).
 */
/**
 * Manual agent loop bütçesi (cookbook: manual-agent-loop — "Custom Loop Control"):
 * kullanıcı mesajı başına otomatik devam adımı üst sınırı; sonsuz araç döngüsünü
 * keser. Adım = araç içeren bir asistan mesajı (her resubmit yeni mesaj açar);
 * mesaj geçmişinden türetildiği için reload sonrası da doğru sayılır.
 * 4 — model cevabı genelde 1-2 araçta tamamlar; kuyruk turları görünür gecikme
 * ürettiği için bütçe sıkı tutulur.
 */
const MAX_AUTO_STEPS = 4

function toolStepCountSinceLastUser(messages: YulaMessage[]): number {
  let count = 0
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i]
    if (m.role === "user") break
    if (
      m.role === "assistant" &&
      m.parts.some((p) => yulaToolPartInfo(p) !== null)
    ) {
      count += 1
    }
  }
  return count
}


/** Son kullanıcı mesajının birleşik metin içeriği (niyet kapısı için). */
function lastUserTextFromMessages(messages: YulaMessage[]): string {
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  if (!lastUser) return "";
  return lastUser.parts
    .map((p) => (p.type === "text" ? ((p as { text?: string }).text ?? "") : ""))
    .join("\n")
    .trim();
}

function isFinalToolState(state: string): boolean {
  return state === "output-available" || state === "output-error";
}

/** Anahtar sırasından bağımsız, kararlı JSON imzası (tekrar-çağrı dedupe'ı). */
function stableSignature(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) {
    return `[${value.map(stableSignature).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableSignature(obj[k])}`)
    .join(",")}}`;
}

/** Dedupe sinyali — hata metni bu önekle başlar (predicate ile paylaşılır). */
const DEDUPE_SKIP_MARKER = "This tool was already executed with the same input in this turn";

/** Wait for arrival at the target pathname so the apply→navigate chain resumes with fresh context. */
function waitForPathname(target: string, timeoutMs = 7000): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  const norm = (p: string) => (p.length > 1 ? p.replace(/\/+$/, "") : p);
  const wanted = norm(target);
  return new Promise((resolve) => {
    if (norm(window.location.pathname) === wanted) {
      resolve(true);
      return;
    }
    const started = Date.now();
    const timer = window.setInterval(() => {
      if (norm(window.location.pathname) === wanted) {
        window.clearInterval(timer);
        resolve(true);
      } else if (Date.now() - started >= timeoutMs) {
        window.clearInterval(timer);
        resolve(false);
      }
    }, 100);
  });
}

/** Does the apply_criteria output carry navigation to another screen? (only when no required fields are missing) */
function isApplyNavigateOutput(output: unknown): boolean {
  if (!output || typeof output !== "object") return false;
  const o = output as Record<string, unknown>;
  return (
    o.status === "ok" &&
    typeof o.navigateTo === "string" &&
    (!Array.isArray(o.missingRequired) || o.missingRequired.length === 0)
  );
}

function shouldContinueAfterToolOutputs(messages: YulaMessage[]): boolean {
  const last = messages[messages.length - 1];
  if (!last || last.role !== "assistant") return false;

  // Canonical: yalnızca son adımın araçlarına bak.
  const lastStepStart = last.parts.reduce(
    (idx, part, index) => (part.type === "step-start" ? index : idx),
    -1,
  );
  const lastStep = last.parts.slice(lastStepStart + 1);
  const toolInfos = lastStep
    .map((p) => yulaToolPartInfo(p))
    .filter((info): info is NonNullable<typeof info> => info !== null);
  if (toolInfos.length === 0) return false;
  if (!toolInfos.every((info) => isFinalToolState(info.state))) return false;

  // Ekran güncelleyen/görselleştiren nihai araçlar YALNIZCA BAŞARILI OLDUĞUNDA durur:
  // Araç hata aldıysa (örn: Binder Error), modelin hata mesajını ve hint'i okuyup
  // kendini düzeltmesi için (Self-Correction Turn) otomatik olarak 2. tur tetiklenir!
  // ask_user_question her durumda terminaldir: cevap yeni kullanıcı mesajıyla gelir.
  // navigate_to_page BİLEREK terminal DEĞİLDİR: sunucu stopWhen akışı bitirir,
  // istemci taze ekran bağlamıyla resubmit eder (araç seti refresh) ve
  // "aç + doldur + çalıştır" zinciri sürer. Yalın navigasyonlar döngüye girmez:
  // resubmit sonrası yeni araç çağrısı yoksa (toolInfos boş) veya model esaslı
  // cevap yazdıysa aşağıdaki kapılar durur; tekrar navigasyon dedupe'a takılır.
  // apply_criteria + navigateTo is NOT terminal either: runPendingTool
  // navigates to the target screen and waits for arrival, so the resubmit
  // goes out with fresh context (confirmation / run continues there).
  const hasSuccessfulTerminalScreenTool = toolInfos.some(
    (i) =>
      [
        "filter_current_grid",
        "set_grid_query",
        "run_job",
        "apply_criteria",
        "open_last_report",
        "visualize_grid_data",
        "ask_user_question",
      ].includes(i.toolName) &&
      (!isFailedToolInfo(i) || i.toolName === "ask_user_question") &&
      // Yönlendirmeli apply: zincir hedef ekranda sürecek, burada durma.
      !(i.toolName === "apply_criteria" && isApplyNavigateOutput(i.output)),
  );
  if (hasSuccessfulTerminalScreenTool) return false;

  // Anti-loop: son araçtan SONRA model detaylı nihai cevabını yazdıysa dur.
  // Giriş cümleleri (örn. "Tarih trendlerini analiz edelim." veya "SQL sorgusu çalıştırıyorum.")
  // kısa intro metinleridir; modelin sonuçları değerlendirmesi için 2. tur devam etmelidir.
  const lastToolIndex = lastStep.reduce(
    (idx, part, index) => (yulaToolPartInfo(part) !== null ? index : idx),
    -1,
  );
  const textAfterTool = lastStep
    .slice(lastToolIndex + 1)
    .map((p) => (p.type === "text" ? (p as { text?: string }).text ?? "" : ""))
    .join("\n")
    .trim();

  // Yalnızca 80 karakterden uzun veya birden fazla satırlı / detaylı açıklama metni varsa nihai cevaptır
  const isSubstantialAnswer = textAfterTool.length > 80 || textAfterTool.includes("\n");
  if (isSubstantialAnswer) return false;

  // Bütçe tükendi: model sonuçlarla devam edemez; kullanıcı yeni mesajla sürdürür.
  return toolStepCountSinceLastUser(messages) < MAX_AUTO_STEPS;
}




type LiveHelpers = Omit<
  YulaChatContextValue,
  | "conversations" | "activeId" | "selectConversation"
  | "deleteConversation" | "newConversation" | "model" | "setModel"
  | "isThinkingEnabled" | "setThinkingEnabled"
>;

const RESPONSE_TIMEOUT_MS = 45000;

/** İstek başlangıç anı — provider tekildir; render sırasında ref geçişi gerekmez. */
let requestStartMs: number | null = null;

function markRequestStart() {
  if (requestStartMs === null) requestStartMs = performance.now()
}

/** Aktif sohbet kimliği — transport kapanışları ref yerine erişimci okur. */
let activeConversationId = "";

/** Son gönderilen ekran snapshot'ı (sohbet başına) — turlar arası diff için. */
const lastScreenSnapshots = new Map<string, ScreenSnapshot>();

function getActiveConversationId() {
  return activeConversationId
}

/**
 * Güncel ajan kimliği: /agents/<id> sayfasındayken URL kazanır (ayrı session),
 * diğer sayfalarda global seçim geçerlidir. null = varsayılan Yula.
 */
function resolveCurrentAgentId(hrefOrPath: string): string | null {
  const fromUrl = extractAgentIdFromPath(hrefOrPath.split("?")[0] || "/");
  if (fromUrl) return fromUrl;
  try {
    return useUserAgentsStore.getState().activeAgentId ?? null;
  } catch {
    return null;
  }
} // 45 saniye azami yanıt süresi eşiği (yerel Ollama model soğuk yükleme payı)

const customFetchWithTimeout: typeof fetch = async (url, init) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort(new Error("Yula AI yanıt süresi azami eşiği (45s) aşıldı."));
  }, RESPONSE_TIMEOUT_MS);

  if (init?.signal) {
    init.signal.addEventListener("abort", () => controller.abort(init.signal?.reason));
  }

  const startMs = performance.now();
  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    console.info(
      `🤖 [Yula Response Telemetry] Stream response started in ${Math.round(performance.now() - startMs)} ms.`,
    );
    return response;
  } catch (err) {
    clearTimeout(timeoutId);
    if (controller.signal.aborted) {
      console.warn(
        `🤖 [Yula Timeout Telemetry] Request aborted due to 45s timeout threshold.`,
      );
      throw new Error("Yula yanıt süresi eşiği (45s) aşıldı. Lütfen tekrar deneyin.");
    }
    throw err;
  }
};

/** Konuşma başına tek taze chat örneği — key değiştikçe sıfırdan kurulur. */
function ChatInstance({
  conversationId,
  onContextReady,
}: {
  conversationId: string;
  onContextReady: (helpers: Omit<
    YulaChatContextValue,
    | "conversations" | "activeId" | "selectConversation"
    | "deleteConversation" | "newConversation"
    | "model" | "setModel" | "isThinkingEnabled" | "setThinkingEnabled"
  >) => void;
}) {
  const router = useRouter();
  const saveMessages = useChatsStore((s) => s.saveMessages);
  const renameFromFirstMessage = useChatsStore(
    (s) => s.renameFromFirstMessage,
  );

  const initialMessages = React.useMemo(
    () => useChatsStore.getState().messagesById[conversationId] ?? [],
    [conversationId],
  );

  const [responseDurations, setResponseDurations] = React.useState<Record<string, number>>({});
  React.useEffect(() => {
    activeConversationId = conversationId;
  });

  const transport = React.useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/agent/chat",
        fetch: customFetchWithTimeout,
        prepareSendMessagesRequest: async ({ messages }) => {
          markRequestStart();
          const href =
            typeof window !== "undefined"
              ? `${window.location.pathname}${window.location.search}`
              : "/";
          const pathname = href;
          const store = useYulaGridStore.getState();
          let spec = store.spec;

          const jobIdSeg = extractJobIdFromHref(href) ?? "";
          const jobDetail = Boolean(jobIdSeg);
          const expectedTable = jobIdSeg
            ? `report_${jobIdSeg.replace(/[^a-zA-Z0-9_]/g, "_")}`
            : "";

          if (
            jobDetail &&
            expectedTable &&
            (!spec || spec.columns.length === 0 || spec.tableName !== expectedTable)
          ) {
            try {
              const { duckDbClient } = await import("@/services/duckdb");
              const { deriveColumnKind } = await import(
                "@/features/jobs/lib/column-type-utils"
              );
              const cols = await duckDbClient.describeTable(expectedTable);
              if (cols.length > 0) {
                store.register({
                  tableName: expectedTable,
                  title: "Stok Bakiye Raporu",
                  columns: cols.map((c) => c.name),
                  rowCount: null,
                  reportScope: "stock-balance",
                  columnTypes: Object.fromEntries(
                    cols.map((c) => [
                      c.name,
                      deriveColumnKind(c.duckType, c.isNumeric),
                    ]),
                  ),
                });
                spec = useYulaGridStore.getState().spec;
              }
            } catch (err) {
              console.warn(
                "[Yula transport] self-heal describeTable başarısız:",
                err,
              );
              upsertTurnTrace(getActiveConversationId(), {
                id: "describe",
                toolName: "worker",
                label: "describeTable başarısız",
                isError: true,
                detailText: err instanceof Error ? err.message : String(err),
                input: { expectedTable },
              });
            }
          }

          const hasActiveGrid = Boolean(spec && spec.columns && spec.columns.length > 0);
          const specMatchesJob =
            hasActiveGrid &&
            (!expectedTable || spec?.tableName === expectedTable);

          const phase: "results" | "results-loading" | "workspace" =
            hasActiveGrid
              ? "results"
              : jobDetail
                ? "results-loading"
                : "workspace";

          // Selected agent — on /agents/<id> the URL wins (separate session),
          // otherwise the global selection passes the scope filter.
          const pathOnly = href.split("?")[0] || "/";
          const agentStore = useUserAgentsStore.getState();
          const routeAgentId = extractAgentIdFromPath(pathOnly);
          const effectiveAgentId = routeAgentId ?? agentStore.activeAgentId;
          const activeAgent = effectiveAgentId
            ? ((routeAgentId
                ? agentStore.agents.find((a) => a.id === routeAgentId)
                : filterAgentsByScope(
                    agentStore.agents,
                    agentScopeWorkspaceId(pathOnly),
                  ).find((a) => a.id === effectiveAgentId)) ?? null)
            : null;

          // WASM vector RAG search (layered: workspace + global). The workspace
          // filter is agent-scoped: a non-global agent scope (e.g. "selling")
          // wins over the page workspace, so report_router candidates stay
          // inside the agent's domain (agent sessions have no page workspace).
          let ragContext: Array<{ scope: string; content: string; metadata?: Record<string, unknown>; distance?: number }> = [];
          const lastUserMsg = messages.filter((m) => m.role === "user").pop();
          const lastTextPart = lastUserMsg?.parts.find((p) => p.type === "text") as { text?: string } | undefined;
          if (lastTextPart?.text) {
            try {
              const { searchChatRagContext } = await import("@/services/duckdb-vector");
              const pageWorkspace = workspaceIdFromPath(href.split("?")[0] || "/");
              const agentRagScope =
                activeAgent?.scope && activeAgent.scope !== "global"
                  ? activeAgent.scope
                  : undefined;
              const ragWorkspace = agentRagScope ?? pageWorkspace;
              // Model-bound context is agent-scoped too: another agent's chat
              // fragments never leak into the prompt. Tier-diverse selection:
              // near-duplicate conversations must not crowd out report
              // routing records.
              ragContext = await searchChatRagContext(lastTextPart.text, 3, {
                workspace: ragWorkspace === "system" ? undefined : ragWorkspace,
                agentId: resolveCurrentAgentId(href),
              });
            } catch (err) {
              console.warn("[Yula RAG] Vector search error:", err);
            }
          }

          const isHome = isWorkspaceHomePath(pathOnly);
          const workspaceId = workspaceIdFromPath(pathOnly);
          const workspaceLabel = workspaceLabelFromPath(pathOnly);
          const mode: "main" | "dock" = isHome || routeAgentId ? "main" : "dock";
          const aiConfig = readYulaClientAiConfig();

          const jobId = extractJobIdFromHref(pathname);
          const lastText = lastTextPart?.text ?? "";
          const gridPrompt = isYulaGridSlashPrompt(lastText);
          const phaseBreak = gridPrompt && phase !== "results";
          const specCols = spec?.columns?.length ?? 0;

          // Canlı ekran snapshot'ı + önceki turdan beri diff (screen-snapshot).
          // Model ek araç adımı harcamadan güncel zemini görür.
          const screenReg = useYulaGridStore.getState().screen as
            | {
                reportScope?: string;
                stateLegend?: Record<string, string>;
                stateExtra?: Record<string, unknown>;
              }
            | null
            | undefined;
          const snapshotScope = screenReg?.reportScope || undefined;
          const draftRows = (
            snapshotScope
              ? (useDraftCriteriaStore.getState().rowsByScope as Record<
                  string,
                  Array<{ name: string; value: string }> | undefined
                >)[snapshotScope]
              : undefined
          ) as Array<{ name: string; value: string }> | undefined;
          const trackedJobs = Object.values(useActiveJobsStore.getState().jobs).map(
            (j) => ({ id: j.id, status: j.status, createdAt: j.createdAt }),
          );
          const screenSnapshot = snapshotScreenState({
            scope: snapshotScope,
            draftRows,
            focusedJobId: jobIdSeg || undefined,
            focusedJobStatus: jobIdSeg
              ? useActiveJobsStore.getState().jobs[jobIdSeg]?.status
              : undefined,
            trackedJobs,
            gridFilters: useYulaGridStore.getState().filters,
            extra: screenReg?.stateExtra,
            phase,
            pathname: pathOnly,
          });
          const screenDiff = diffScreenSnapshots(
            lastScreenSnapshots.get(getActiveConversationId()) ?? null,
            screenSnapshot,
          );
          lastScreenSnapshots.set(getActiveConversationId(), screenSnapshot);

          if (specMatchesJob && expectedTable) {
            upsertTurnTrace(getActiveConversationId(), {
              id: "describe",
              toolName: "worker",
              label: "Tablo hazır",
              subLabel: expectedTable,
              input: { expectedTable, specCols },
            });
          }

          upsertTurnTrace(getActiveConversationId(), {
            id: "phase",
            toolName: "worker",
            label: `Phase: ${phase}`,
            subLabel: jobId ? jobId.slice(0, 8) : "job yok",
            isError: phaseBreak,
            detailText: phaseBreak
              ? "Grid komutu results fazı olmadan gitti — sunucu tablo araçlarını bağlamaz."
              : undefined,
            input: {
              href,
              jobId,
              expectedTable,
              specTable: spec?.tableName ?? null,
              specCols,
              specMatchesJob,
              phase,
              gridPrompt,
            },
            output: {
              gridAttached: phase === "results",
              toolSet:
                phase === "results"
                  ? "grid"
                  : phase === "results-loading"
                    ? "none"
                    : "workspace",
            },
          });

          upsertTurnTrace(getActiveConversationId(), {
            id: "rag",
            toolName: "worker",
            label: `RAG: ${ragContext.length} kayıt`,
            input: { query: lastText.slice(0, 200) },
            output: { count: ragContext.length, scopes: ragContext.map((r) => r.scope) },
          });

          upsertTurnTrace(getActiveConversationId(), {
            id: "tools",
            toolName: "worker",
            label:
              phase === "results"
                ? "Araç seti: grid"
                : phase === "results-loading"
                  ? "Araç seti: yok (tablo yükleniyor)"
                  : "Araç seti: workspace",
            isError: phaseBreak,
            input: { phase, gridPrompt },
          });

          upsertTurnTrace(getActiveConversationId(), {
            id: "flush-prompt",
            toolName: "worker",
            label: "HTTP /api/agent/chat",
            isLive: true,
            // Sunucu çözümüyle aynı öncelik (ajan pini > sohbet > genel):
            // ham store modeli değil, efektif kimlik loglanır.
            input: {
              phase,
              provider:
                activeAgent?.provider || aiConfig.provider || "(sunucu varsayılanı)",
              model:
                activeAgent?.model ||
                useChatsStore.getState().model ||
                aiConfig.model ||
                "(sunucu varsayılanı)",
            },
          });

          return {
            body: {
              messages: slimMessagesForTransport(messages),
              model: useChatsStore.getState().model || aiConfig.model,
              ...(aiConfig.provider ? { provider: aiConfig.provider } : {}),
              ...(aiConfig.endpoint ? { endpoint: aiConfig.endpoint } : {}),
              // Efor önceliği: ajan pini > global ayar. Boş = miras (sunucu default uygular).
              ...(activeAgent?.effort ?? aiConfig.effort
                ? { effort: activeAgent?.effort ?? aiConfig.effort }
                : {}),
              thinkingEnabled:
                activeAgent?.thinking ??
                useChatsStore.getState().isThinkingEnabled,
              context: {
                pathname,
                mode,
                workspaceId,
                workspaceLabel,
                phase,
                jobId: jobId ?? (spec?.tableName?.startsWith("report_") ? spec.tableName.replace(/^report_/, "") : undefined),
                grid:
                  (phase === "results" || hasActiveGrid) && spec && spec.columns.length > 0
                    ? {
                        ...spec,
                        filters: useYulaGridStore.getState().filters,
                        customQuerySql: useYulaGridStore.getState().customQuerySql,
                        customQueryTitle: useYulaGridStore.getState().customQueryTitle,
                      }
                    : null,
                screen: useYulaGridStore.getState().screen,
                ragContext,
                screenState: screenSnapshot,
                screenDiff,
                stateLegend: screenReg?.stateLegend,
                // Kullanıcı skill envanteri (yalnızca isim/açıklama —
                // progressive disclosure; tam talimat run_user_skill ile).
                // Ajanın açık seçimi kapsamı ezer (boş = yok); Yula'da kapsam filtresi.
                userSkills: (() => {
                  const storeSkills = useUserSkillsStore.getState().skills;
                  const list = activeAgent
                    ? (() => {
                        const allowed = new Set(
                          (activeAgent.skills ?? []).map((s) => s.toLowerCase()),
                        );
                        if (allowed.size === 0) return [];
                        return getAllUserSkillsInventory(
                          storeSkills,
                          BUILT_IN_USER_SKILLS,
                        ).filter((s) => allowed.has(s.slash.toLowerCase()));
                      })()
                    : getEffectiveUserSkills(
                        storeSkills,
                        BUILT_IN_USER_SKILLS,
                        workspaceId,
                      );
                  return list.map((s) => ({
                    slash: s.slash,
                    label: s.label,
                    description: s.description,
                  }));
                })(),
                // Seçili ajan kimliği (kapsam dışıysa yok sayılır).
                agent: activeAgent
                  ? {
                      name: activeAgent.name,
                      instructions: activeAgent.instructions,
                      tools: activeAgent.tools,
                      skills: activeAgent.skills,
                      scope: activeAgent.scope,
                      provider: activeAgent.provider,
                      model: activeAgent.model,
                      effort: activeAgent.effort,
                      attachments: activeAgent.attachments,
                    }
                  : null,
              },
            },
          };
        },
      }),
    [],
  );

  // Kullanıcı "durdur" bayrağı — bir sonraki kullanıcı mesajına kadar otomatik
  // devam döngüsünü (sendAutomaticallyWhen + araç yürütme) kilitler.
  const userStoppedRef = React.useRef(false);
  // UI-reaktif kopya (durdurulan kısmi metin akışlarında retry butonu için)
  const [stopped, setStopped] = React.useState(false);
  // Akış hatası (sağlayıcı 401/kota/ağ vb.) — asistan mesaj id'sine kaydedilir;
  // SilentTurnFallback genel "sessiz tur" yerine anlamlı hata gösterir.
  const [streamErrorTexts, setStreamErrorTexts] = React.useState<
    Record<string, string>
  >({});
  // Tur içinde çalıştırılan araç çağrıları (araç:girdi imzası). Aynı imza
  // tekrar gelirse yeniden KOŞULMAZ; modele "zaten çalıştı" hatası döner.
  // Küçük modellerin (gemma) [metin + aynı araç çağrısı] turlarını sonsuza
  // kadar tekrarlamasını buradaki sinyal keser.
  const executedCallsRef = React.useRef<Map<string, string>>(new Map());

  const chat = useChat<YulaMessage>({
    id: conversationId,
    messages: initialMessages,
    transport,
    // Streaming render seyreltme — memoized markdown bloklarıyla akıcı güncelleme
    throttle: 60,
    onError(err) {
      console.error("🤖 [Yula Chat Client Error Details]:", err);
      userStoppedRef.current = true;
      setStopped(true);
      const raw = err instanceof Error ? err.message : String(err);
      upsertTurnTrace(getActiveConversationId(), {
        id: "client-error",
        toolName: "worker",
        label: "İstemci hatası",
        isError: true,
        detailText: raw,
      });
      // Akış hatasını son asistan mesajına işle — SilentTurnFallback genel
      // "sessiz tur" yerine anlamlı hata mesajı göstersin.
      const lastAssistant = [...chat.messages]
        .reverse()
        .find((m) => m.role === "assistant");
      if (lastAssistant && raw) {
        setStreamErrorTexts((prev) =>
          prev[lastAssistant.id] === raw ? prev : { ...prev, [lastAssistant.id]: raw },
        );
      }
    },
    // Cookbook/Client-Tools deseni: araç çıktısı eklendiğinde akış kendiliğinden
    // devam etsin (manuel sendMessage yerine SDK köprüsü).
    sendAutomaticallyWhen: ({ messages }) =>
      !userStoppedRef.current && shouldContinueAfterToolOutputs(messages),
  });

  const status = chat.status;

  // Storage Buckets & WASM Vector RAG şema indeksleyicisi
  React.useEffect(() => {
    void import("@/lib/yula-storage-buckets").then(({ initYulaStorageBuckets }) => {
      void initYulaStorageBuckets().catch(() => {});
    });
    void import("@/services/duckdb-vector").then(({ indexReportSchemas }) => {
      void indexReportSchemas().catch((err) =>
        console.warn("[Yula RAG] Background indexing error:", err),
      );
    });
  }, []);

  // Konuşma kalıcılığı (localStorage / zustand persist) — ajan kimliğiyle birlikte.
  React.useEffect(() => {
    if (!conversationId || status !== "ready") return;
    const currentPath =
      typeof window !== "undefined"
        ? `${window.location.pathname}${window.location.search}`
        : undefined;
    const currentAgentId = currentPath ? resolveCurrentAgentId(currentPath) : null;
    saveMessages(conversationId, chat.messages, currentPath, currentAgentId);
    const firstUser = chat.messages.find((m) => m.role === "user");
    const textPart = firstUser?.parts.find(
      (p): p is Extract<(typeof p), { type: "text" }> => p.type === "text",
    );
    const text =
      textPart && textPart.type === "text" ? textPart.text : "";
    if (text) renameFromFirstMessage(conversationId, text, currentAgentId);
  }, [status, chat.messages, conversationId, saveMessages, renameFromFirstMessage]);

  const runPendingTool = React.useCallback(
    async (part: {
      toolCallId: string;
      toolName: string;
      input?: unknown;
      state?: string;
    }) => {
      if (part.state && part.state !== "input-available") return;
      // Sunucu-execute araçlar istemcide koşmaz (çift yürütme + bozuk resubmit).
      if (SERVER_EXECUTED_TOOLS.has(part.toolName)) return;
      // Yürütme tamamen patlarsa bile SDK kanonik hata çıktısı ekle
      // (state:"output-error" + errorText) — aksi halde satır "Çalışıyor…"da
      // asılı kalır ve resubmit hatalı geçmişle sunucuda patlar.
      // Tekrar-çağrı kesici: aynı araç + aynı girdi bu turda zaten koştuysa
      // yeniden ÇALIŞTIRMA; modele düzeltme sinyali ver (SDK sözleşmesi:
      // state:"output-error" + errorText).
      const callSignature = `${part.toolName}:${stableSignature(part.input ?? null)}`;
      if (executedCallsRef.current.has(callSignature)) {
        chat.addToolOutput({
          tool: part.toolName as keyof YulaTools,
          toolCallId: part.toolCallId,
          state: "output-error",
          errorText:
            DEDUPE_SKIP_MARKER +
            " and the result would not change. " +
            "Do not call the same tool again; give your final answer in one go with the results at hand.",
        });
        return;
      }

      let output: unknown;
      let errorText: string | undefined;
      try {
        const userText = lastUserTextFromMessages(chat.messages);
        const gatedRun =
          part.toolName === "run_job" && !hasExplicitReportRunIntent(userText);

        if (gatedRun) {
          output = blockedIncompleteIntent("run_job");
        } else {
          const timeoutMs =
            part.toolName === "profile_grid_table" ||
            part.toolName === "run_expert_sql"
              ? 45_000
              : 25_000;
          output = await Promise.race([
            executeClientTool(part.toolName, part.input),
            new Promise<never>((_, reject) => {
              window.setTimeout(() => {
                reject(
                  new Error(
                    `${part.toolName} ${Math.round(timeoutMs / 1000)} sn içinde bitmedi. Tablo yükleniyor veya meşgul olabilir — Durdur'a basıp birkaç saniye sonra tekrar deneyin.`,
                  ),
                );
              }, timeoutMs);
            }),
          ]);
        }
      } catch (err) {
        console.warn("[Yula exec] araç yürütme hatası:", part.toolName, err);
        output = undefined;
        errorText = err instanceof Error ? err.message : String(err);
      }
      executedCallsRef.current.set(callSignature, "");

      if (part.toolName === "run_job") {
        // Statik araç → outputSchema tipiyle birebir (cast yok)
        chat.addToolOutput({
          tool: part.toolName as keyof YulaTools,
          toolCallId: part.toolCallId,
          state: "output-available",
          output: output as YulaTools["run_job"]["output"],
        });
      } else if (part.toolName === "apply_criteria") {
        // Navigating apply: navigate to the target screen and wait for arrival
        // BEFORE appending the output — the resubmit then carries the fresh
        // pathname/screenState, and the model continues with the confirmation
        // sentence/link (or run_job on explicit run intent).
        // On timeout the output is still appended, so the model writes the link fallback.
        if (isApplyNavigateOutput(output)) {
          const target = (output as Record<string, unknown>).navigateTo as string;
          useChatsStore.getState().beginConversationFollow(getActiveConversationId());
          useYulaDockStore.getState().setOpen(true);
          void router.push(target);
          await waitForPathname(target);
        }
        chat.addToolOutput({
          tool: "apply_criteria",
          toolCallId: part.toolCallId,
          state: "output-available",
          output: output as YulaTools["apply_criteria"]["output"],
        });
      } else if (part.toolName === "navigate_to_page") {
        chat.addToolOutput({
          tool: "navigate_to_page",
          toolCallId: part.toolCallId,
          state: "output-available",
          output: output as YulaTools["navigate_to_page"]["output"],
        });
      } else if (errorText !== undefined) {
        // SDK ToolUIPart sözleşmesi: hata → state:"output-error" + errorText
        chat.addToolOutput({
          tool: part.toolName as keyof YulaTools,
          toolCallId: part.toolCallId,
          state: "output-error",
          errorText,
        });
      } else {
        // Dinamik grid araçları → runtime şema; isim cast'i SDK deseni
        chat.addToolOutput({
          tool: part.toolName as keyof YulaTools,
          toolCallId: part.toolCallId,
          state: "output-available",
          output: output as never,
        });
      }

      // Prepare-chain telemetrisi: zincir araçlarının sonucu tek satırda
      // (schema → apply → navigate → run). Atlanan/hata veren adımın nedeni
      // "yarım kaldı" teşhisinde 10 saniyede görünür.
      if (
        part.toolName === "apply_criteria" ||
        part.toolName === "navigate_to_page" ||
        part.toolName === "run_job" ||
        part.toolName === "get_report_schema" ||
        part.toolName === "find_matching_report"
      ) {
        const statusText =
          typeof output === "object" && output !== null
            ? String((output as Record<string, unknown>).status ?? "")
            : "";
        const chainLabel =
          part.toolName === "get_report_schema"
            ? "Zincir: şema"
            : part.toolName === "find_matching_report"
              ? "Zincir: eşleşme"
              : part.toolName === "apply_criteria"
                ? "Zincir: kriter doldurma"
                : part.toolName === "navigate_to_page"
                  ? "Zincir: yönlendirme"
                  : "Zincir: çalıştırma";
        upsertTurnTrace(getActiveConversationId(), {
          id: `prepare-chain:${part.toolCallId}`,
          toolName: part.toolName,
          label: chainLabel,
          subLabel: statusText || (errorText ? "hata" : "ok"),
          isError:
            errorText !== undefined ||
            statusText === "error" ||
            statusText === "validation-error" ||
            statusText === "blocked",
          detailText:
            errorText ??
            (statusText && statusText !== "ok" && statusText !== "navigated" && statusText !== "executed"
              ? `Durum: ${statusText} — zincir bu adımda durdu.`
              : undefined),
          input: part.input,
        });
      }

      const execOut =
        typeof output === "object" && output !== null
          ? (output as Record<string, unknown>)
          : undefined;

      // Route when a real job opened or a page navigation was requested.
      // (apply_criteria navigation is handled above, with arrival awaited.)
      if (
        (execOut?.status === "executed" || execOut?.status === "navigated") &&
        typeof execOut.navigateTo === "string"
      ) {
        useChatsStore.getState().beginConversationFollow(getActiveConversationId());
        useYulaDockStore.getState().setOpen(true);
        void router.push(execOut.navigateTo as string);
      }
      // sendAutomaticallyWhen=true → resubmission SDK tarafında otomatik
    },
    [chat, router],
  );

  // İstemci-tarafı araç döngüsü (cookbook "client tools"):
  // asistan turu bittiğinde bekleyen YÜRÜTÜLEBİLİR araç varsa otomatik koştur.
  // Kriter kartı katmanı kaldırıldı; rapor çalıştırma yalnız run_job ile.
  const handledToolsRef = React.useRef<Set<string>>(new Set());
  const [isExecutingTools, setIsExecutingTools] = React.useState(false);

  React.useEffect(() => {
    // TÜM asistan mesajlarındaki bekleyen araçları topla — yalnız son mesajı değil.
    // Kesintiye uğrayan eski turlar (hata/reload) sonradan gelen mesajlarla
    // kendini onaramazdı; burada geriye dönük self-heal yapılır.
    const pending = chat.messages.flatMap((m) =>
      m.role === "assistant"
        ? m.parts
            .map((p) => yulaToolPartInfo(p))
            .filter(
              (info): info is NonNullable<typeof info> =>
                info !== null &&
                info.state === "input-available" &&
                !SERVER_EXECUTED_TOOLS.has(info.toolName) &&
                !handledToolsRef.current.has(info.toolCallId),
            )
        : [],
    );
    if (pending.length === 0) return;
    pending.forEach((info) => handledToolsRef.current.add(info.toolCallId));

    void (async () => {
      setIsExecutingTools(true);
      try {
        for (const info of pending) {
          // Kullanıcı bu sırada durdurduysa kalan araçları koşturma
          if (userStoppedRef.current) break;
          // Manual agent loop telemetrisi (cookbook: "custom logging")
          console.info(
            `[Yula Agent Loop] adım ${toolStepCountSinceLastUser(chat.messages) + 1}/${MAX_AUTO_STEPS} → ${info.toolName}`,
          );
          await runPendingTool({
            toolCallId: info.toolCallId,
            toolName: info.toolName,
            input: info.input,
            state: info.state,
          });
        }
      } finally {
        setIsExecutingTools(false);
      }
    })();
  }, [status, chat.messages, runPendingTool]);

  /**
   * "Yanıtı durdur" — akışı keser, bekleyen araç çağrılarını "durduruldu"
   * çıktısıyla kapatır (satırlar "Çalışıyor…"da asılı kalmasın) ve otomatik
   * devam döngüsünü bir sonraki kullanıcı mesajına kadar duraklatır.
   */
  const stopResponse = React.useCallback(async () => {
    userStoppedRef.current = true;
    setStopped(true);
    await chat.stop();
    const last = chat.messages[chat.messages.length - 1];
    if (last?.role === "assistant") {
      for (const p of last.parts) {
        const info = yulaToolPartInfo(p);
        if (info?.state === "input-available") {
          // SDK ToolUIPart sözleşmesi: hata → state:"output-error" + errorText
          chat.addToolOutput({
            tool: info.toolName as keyof YulaTools,
            toolCallId: info.toolCallId,
            state: "output-error",
            errorText: "Kullanıcı tarafından durduruldu.",
          });
        }
      }
    }
  }, [chat]);

  /**
   * "Yeniden dene" — SDK `regenerate`/`sendMessage` ikilisinin akıllı seçimi:
   *  • Son asistan mesajında tamamlanmış metin var → `chat.regenerate()`
   *    (SDK o mesajı geçmişten atar ve cevabı yeniden üretir).
   *  • Yoksa (durdurulmuş akış: yalnız araç parçaları) → argsız `sendMessage()`
   *    geçmişi olduğu gibi resubmit eder; araç çıktıları korunur, model devam eder.
   */
  const retryResponse = React.useCallback(async () => {
    userStoppedRef.current = false;
    setStopped(false);
    // Yeniden deneme yeni bir tur açar: tekrar-çağrı hafızası sıfırlanır.
    executedCallsRef.current.clear();
    const last = chat.messages[chat.messages.length - 1];
    const hasText =
      last?.role === "assistant" &&
      last.parts.some(
        (p) =>
          p.type === "text" &&
          typeof (p as { text?: unknown }).text === "string" &&
          ((p as { text?: string }).text ?? "").trim().length > 0,
      );
    if (hasText) {
      await chat.regenerate();
    } else {
      await chat.sendMessage();
    }
  }, [chat]);

  // TÜM YANIT SÜRECİ AKTİF Mİ? (LLM akışı + Araç yürütmeleri + Otomatik devam turları)
  const hasPendingTools = React.useMemo(() => {
    return chat.messages.some(
      (m) =>
        m.role === "assistant" &&
        m.parts.some(
          (p) => yulaToolPartInfo(p)?.state === "input-available",
        ),
    );
  }, [chat.messages]);

  const willAutoContinue = React.useMemo(() => {
    return shouldContinueAfterToolOutputs(chat.messages);
  }, [chat.messages]);

  const isTurnActive =
    (status === "submitted" ||
      status === "streaming" ||
      isExecutingTools ||
      hasPendingTools ||
      willAutoContinue) &&
    !stopped;

  // Gönder → SDK `submitted` arası boşlukta busy false kalmasın (peş peşe mesaj).
  const [sendGate, setSendGate] = React.useState(false);
  const busy = isTurnActive || sendGate;
  const busyRef = React.useRef(busy);
  React.useEffect(() => {
    busyRef.current = busy;
  });

  const pagePathname = usePathname();
  const liveGridSpec = useYulaGridStore((s) => s.spec);

  React.useEffect(() => {
    if (!isReportResultPath(pagePathname)) return;
    if (!liveGridSpec?.columns.length) return;
    if (status !== "ready") return;
    if (busyRef.current) return;
    const queued = takeQueuedYulaPrompt();
    if (!queued) return;
    const connectQueued = () => {
      userStoppedRef.current = false;
      setStopped(false);
      setSendGate(true);
    }
    connectQueued();
    upsertTurnTrace(conversationId, {
      id: "open-results",
      toolName: "worker",
      label: "Sonuç tablosu açıldı",
      isLive: false,
      input: { pathname: pagePathname },
      output: {
        table: liveGridSpec.tableName,
        cols: liveGridSpec.columns.length,
      },
    });
    upsertTurnTrace(conversationId, {
      id: "flush-prompt",
      toolName: "worker",
      label: "Kuyruktaki komut gönderiliyor",
      isLive: true,
      input: { queued },
    });
    void chat.sendMessage({ text: queued });
  }, [pagePathname, liveGridSpec, status, chat, conversationId]);

  React.useEffect(() => {
    if (!sendGate) return;
    const releaseGate = () => {
      if (isTurnActive) {
        setSendGate(false);
        return true;
      }
      return false;
    }
    if (releaseGate()) return;
    const t = window.setTimeout(() => setSendGate(false), 8_000);
    return () => window.clearTimeout(t);
  }, [sendGate, isTurnActive]);

  // Kullanıcı mesajı gönderdiği an veya tur aktifleştiği an bekleme süresi başlar (KesintisizSayaç)
  React.useEffect(() => {
    if (isTurnActive && requestStartMs === null) {
      requestStartMs = performance.now();
    }
  }, [isTurnActive]);

  // TÜM Yanıt Süreci tamamen bittiğinde (!isTurnActive) GERÇEK KÜMÜLATİF bekleme süresini kaydet
  React.useEffect(() => {
    if (!isTurnActive && requestStartMs !== null) {
      const durationSec = Number(
        ((performance.now() - requestStartMs) / 1000).toFixed(1),
      );
      const assistantMsgs = chat.messages.filter((m) => m.role === "assistant");
      const finalDuration = durationSec > 0 ? durationSec : 0.1;
      const applyDuration = () => {
        setResponseDurations((prev) => {
          const next = { ...prev };
          for (const m of assistantMsgs) {
            if (!next[m.id]) {
              next[m.id] = finalDuration;
            }
          }
          return next;
        });
      };
      applyDuration();
      requestStartMs = null;
    }
  }, [isTurnActive, chat.messages]);

  React.useEffect(() => {
    if (isTurnActive) return;
    const liveHttp = getTurnTrace(conversationId).find(
      (s) => s.id === "flush-prompt" && s.isLive,
    );
    if (!liveHttp) return;
    upsertTurnTrace(conversationId, {
      ...liveHttp,
      isLive: false,
      label: "HTTP /api/agent/chat bitti",
    });
  }, [isTurnActive, conversationId]);

  const [llmStepCounts, setLlmStepCounts] = React.useState<Record<string, number>>({});

  // Asistan mesajlarındaki ekranda görünen Worked adımlarının sayısını hesapla
  React.useEffect(() => {
    const assistantMsgs = chat.messages.filter((m) => m.role === "assistant");
    const counts: Record<string, number> = {};
    for (const msg of assistantMsgs) {
      const steps = extractWorkedSteps(msg, false);
      if (steps.length > 0) {
        counts[msg.id] = steps.length;
      } else {
        const stepStarts = msg.parts.filter((p) => p.type === "step-start").length;
        counts[msg.id] = stepStarts > 0 ? stepStarts : 1;
      }
    }
    const applyCounts = () => {
      setLlmStepCounts(counts);
    }
    applyCounts();
  }, [chat.messages]);

  /**
   * "Mesajı Geri Al" (Undo) — seçilen kullanıcı mesajını ve altındaki tüm sonraki
   * turları geçmişten ve LLM bağlamından (messages) siler, soru metnini döndürür.
   */
  const undoToUserMessage = React.useCallback(
    (messageId: string): string | undefined => {
      const idx = chat.messages.findIndex((m) => m.id === messageId);
      if (idx === -1) return undefined;

      const targetMsg = chat.messages[idx];
      const textPart = targetMsg.parts.find((p) => p.type === "text") as
        | { text?: string }
        | undefined;
      const userText = textPart?.text ?? "";

      const remainingMessages = chat.messages.slice(0, idx);
      chat.setMessages(remainingMessages);

      const currentPath =
        typeof window !== "undefined"
          ? `${window.location.pathname}${window.location.search}`
          : undefined;
      saveMessages(
        conversationId,
        remainingMessages,
        currentPath,
        currentPath ? resolveCurrentAgentId(currentPath) : null,
      );

      userStoppedRef.current = false;
      setStopped(false);
      executedCallsRef.current.clear();

      return userText;
    },
    [chat, conversationId, saveMessages],
  );

  const value = React.useMemo(() => ({
    messages: chat.messages,
    status: chat.status,
    stop: stopResponse,
    error: chat.error,
    busy,
    stopped,
    retryResponse,
    undoToUserMessage,
    addToolOutput: chat.addToolOutput,
    isTurnActive: busy,
    responseDurations,
    llmStepCounts,
    streamErrorTexts,
    sendMessageText: (
      text: string,
      attachmentsList?: Array<{ name: string; type: string; dataUrl?: string }>,
    ) => {
      void (async () => {
      clearTurnTrace(conversationId);
      if (busyRef.current) {
        userStoppedRef.current = true;
        upsertTurnTrace(conversationId, {
          id: "busy-interrupt",
          toolName: "worker",
          label: "Önceki tur kesildi",
          detailText: "Yeni mesaj için bekleyen akış durduruldu.",
        });
        try {
          await chat.stop();
        } catch {
          /* ignore */
        }
      }

      const href =
        typeof window !== "undefined"
          ? `${window.location.pathname}${window.location.search}`
          : "";
      const pathOnly = href.split("?")[0] || "/";
      const selectedJobId = extractJobIdFromHref(href);
      const expectedTable = selectedJobId
        ? `report_${selectedJobId.replace(/[^a-zA-Z0-9_]/g, "_")}`
        : "";
      const spec = useYulaGridStore.getState().spec;
      const tableReadyOnScreen =
        Boolean(expectedTable) &&
        spec?.tableName === expectedTable &&
        (        spec.columns?.length ?? 0) > 0;

      upsertTurnTrace(conversationId, {
        id: "user-send",
        toolName: "worker",
        label: "İstek alındı",
        subLabel: text.slice(0, 80),
        input: {
          text,
          href,
          selectedJobId,
          expectedTable,
          specTable: spec?.tableName ?? null,
          specCols: spec?.columns?.length ?? 0,
          tableReadyOnScreen,
          resultPath: isReportResultPath(pathOnly),
        },
      });

      if (
        isYulaGridSlashPrompt(text) &&
        !isReportResultPath(pathOnly) &&
        selectedJobId &&
        !tableReadyOnScreen
      ) {
        queueYulaPrompt(text);
        const exec = reportExecutionPath(pathOnly);
        const to = exec ? `${exec}/${selectedJobId}` : null;
        upsertTurnTrace(conversationId, {
          id: "open-results",
          toolName: "worker",
          label: "Sonuç tablosu açılıyor",
          subLabel: selectedJobId.slice(0, 8),
          isLive: true,
          input: { from: href, to },
          output: { reason: "grid slash; tablo henüz oluşmamış" },
        });
        if (to) {
          useChatsStore.getState().beginConversationFollow(conversationId);
          useYulaDockStore.getState().setOpen(true);
          router.push(to);
        }
        return;
      }

      setSendGate(true);
      // Yeni kullanıcı mesajı → durdurma kilidini kaldır, tur sıfırdan başlar
      userStoppedRef.current = false;
      setStopped(false);
      executedCallsRef.current.clear();

      // Koruma: Bekleyen (yanıtlanmamış) tüm araç çağrılarını kapat ki SDK missing tool result hatası atmasın
      for (const m of chat.messages) {
        if (m.role === "assistant") {
          for (const p of m.parts) {
            const info = yulaToolPartInfo(p);
            if (info?.state === "input-available") {
              chat.addToolOutput({
                tool: info.toolName as keyof YulaTools,
                toolCallId: info.toolCallId,
                state: "output-error",
                errorText: "Kullanıcı yeni mesaj gönderdiği için atlandı.",
              });
            }
          }
        }
      }

      const imageFiles = (attachmentsList ?? []).filter(
        (f) => f.dataUrl && f.type.startsWith("image/"),
      );
      const nonImageFiles = (attachmentsList ?? []).filter(
        (f) => !f.type.startsWith("image/"),
      );

      const attachmentNote =
        nonImageFiles.length > 0
          ? `\n\n[Ekler: ${nonImageFiles.map((file) => file.name).join(", ")}]`
          : "";

      const finalText = `${text}${attachmentNote}`.trim();

      if (imageFiles.length > 0) {
        const files = imageFiles.map((f) => ({
          type: "file" as const,
          filename: f.name,
          mediaType: f.type,
          url: f.dataUrl!,
        }));
        void chat.sendMessage({ text: finalText, files });
      } else {
        void chat.sendMessage({ text: finalText });
      }
      })();
    },
    runPendingTool,
  }), [chat, runPendingTool, stopResponse, retryResponse, undoToUserMessage, stopped, responseDurations, llmStepCounts, streamErrorTexts, busy, router, conversationId]);

  // Üst sağlayıcıya canlı yardımcıları duyur (imza-eşikli)
  React.useEffect(() => {
    onContextReady(value);
  }, [onContextReady, value]);

  return null;
}

/** Sohbetin ilk kullanıcı mesajının metnini döner (geçmiş indeksleme bağlamı için). */
function firstUserMessageText(messages?: YulaMessage[]): string {
  const firstUser = messages?.find((m) => m.role === "user");
  const textPart = firstUser?.parts.find(
    (p): p is Extract<(typeof p), { type: "text" }> => p.type === "text",
  );
  return textPart && textPart.type === "text" ? (textPart.text ?? "") : "";
}

export function YulaChatProvider({ children }: { children: React.ReactNode }) {
  const activeId = useChatsStore((s) => s.activeId);
  const conversations = useChatsStore((s) => s.conversations);
  const model = useChatsStore((s) => s.model);
  const setModel = useChatsStore((s) => s.setModel);

  const pathname = usePathname();

  // Dock açıldığında aktif konuşmanın varlığını garanti et
  React.useEffect(() => {
    useChatsStore.getState().ensureActiveConversation();
  }, []);

  // Eski kayıt self-heal: ana sayfaya bağlı kalmış sohbetleri mesajlarındaki
  // son navigasyon hedefine bağla (açılışta bir kez).
  React.useEffect(() => {
    healConversationRecords();
  }, []);

  // Ekran bazlı aktif sohbet yönetimi:
  // Sayfa değişiminde (veya sayfa yüklendiğinde) aktif sohbetin O EKRANA ait olup olmadığını denetler.
  // Eğer aktif sohbet o ekrana ait değilse:
  //   1) O ekrana ait kaydedilmiş geçmiş sohbet varsa onu seçer,
  //   2) Yoksa taze yeni sohbet başlatır.
  const activePathRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (activePathRef.current === pathname) return;
    activePathRef.current = pathname;

    // Ayrı ajan oturumu: URL'deki ajan kimliği global seçimi ezer.
    // Yula kökü (/) her zaman saf Yula'dır: eski ajan seçimi temizlenir,
    // böylece ana ekranda ajan çipi/persona sızıntısı olmaz.
    const routeAgentId = extractAgentIdFromPath(pathname);
    if (routeAgentId) {
      const agentStore = useUserAgentsStore.getState();
      if (agentStore.activeAgentId !== routeAgentId) {
        agentStore.setActiveAgentId(routeAgentId);
      }
    } else if (pathname === "/") {
      const agentStore = useUserAgentsStore.getState();
      if (agentStore.activeAgentId !== null) {
        agentStore.setActiveAgentId(null);
      }
    }

    const store = useChatsStore.getState();
    const currentActiveId = store.activeId;

    // Sohbet KENDİ navigasyonuyla sayfa değiştirdiyse: hedefe VARILDIĞINDA
    // kaydı yeni sayfaya bağla (son açılan sayfa kazanır) ve aktif sohbeti koru.
    // Push'tan ÖNCE bağlamak çalışmaz — persist efekti eski sayfada kaydedip ezer.
    // Ajan kimliği korunur: ajan session'ından rapor sayfasına geçişte persona kaybolmaz.
    const follow = store.followNav;
    if (follow) {
      useChatsStore.setState({ followNav: null });
      if (follow.id === currentActiveId && Date.now() - follow.at < 15_000) {
        const followAgentId =
          store.conversations.find((c) => c.id === follow.id)?.agentId ??
          routeAgentId ??
          useUserAgentsStore.getState().activeAgentId ??
          null;
        store.followArrivedConversation(follow.id, undefined, followAgentId);
        return;
      }
    }

    // Her sayfa değişimi = taze sohbet: aktif sohbet yalnız bu sayfaya BİREBİR
    // bağlıysa VE aynı ajan kimliğini taşıyorsa korunur (history tıklaması da
    // bu eşleşmeyle korunur); aksi halde yeni sohbet açılır.
    const activeConv = store.conversations.find((c) => c.id === currentActiveId);
    const activeMsgs = currentActiveId ? store.messagesById[currentActiveId] ?? [] : [];
    const currentAgentId =
      routeAgentId ?? useUserAgentsStore.getState().activeAgentId ?? null;
    const isSamePage = activeConv
      ? normalizePath(activeConv.pathname ?? "/") === normalizePath(pathname) &&
        (activeConv.agentId ?? null) === (currentAgentId ?? null)
      : activeMsgs.length === 0;

    if (!isSamePage) {
      store.newConversation();
    }
  }, [pathname]);

  // Soğuk başlangıç ısıtması: dock açılır açılmaz Ollama modeli belleğe
  // yüklenir (models route'u boş-prompt warmup tetikler) → ilk mesaj hızlı.
  React.useEffect(() => {
    void fetch(yulaModelsApiUrl()).catch(() => {
      // Isıtma best-effort
    });
  }, []);

  // Sohbet geçmişini RAG vektör store'a indeksle (ilk yükleme + her yeni
  // sohbet/kayıtta artımlı). Ana sayfa araması menülerle birlikte geçmişi de
  // semantik arayabilsin diye. duckdb-vector'ü tembel yükle (WASM).
  React.useEffect(() => {
    if (conversations.length === 0) return;
    const store = useChatsStore.getState();
    const items = conversations
      .map((c) => ({
        id: c.id,
        title: c.title,
        pathname: c.pathname,
        jobId: c.jobId,
        agentId: c.agentId ?? null,
        snippet: firstUserMessageText(store.messagesById[c.id]).slice(0, 400),
      }))
      .filter((i) => i.snippet.trim().length > 0);
    if (items.length === 0) return;
    void import("@/services/duckdb-vector").then(({ indexConversationHistory }) => {
      void indexConversationHistory(items).catch(() => {
        // Geçmiş indeksleme best-effort
      });
    });
  }, [conversations]);

  const router = useRouter();
  const selectConversation = React.useCallback(
    (id: string) => {
      const store = useChatsStore.getState();
      store.selectConversation(id);
      const target = store.conversations.find((c) => c.id === id);
      if (!target) return;
      // Geçmişten ajan sohbeti seçildiyse persona seçimini de eşitle.
      if (target.agentId) {
        useUserAgentsStore.getState().setActiveAgentId(target.agentId);
      }
      navigateToConversationScreen(
        target,
        (href) => {
          router.push(href);
        },
        store.messagesById[id],
      );
    },
    [router],
  );
  const deleteConversation = React.useCallback(
    (id: string) => useChatsStore.getState().deleteConversation(id),
    [],
  );
  const [liveHelpers, setLiveHelpers] = React.useState<LiveHelpers | null>(null)

  const newConversation = React.useCallback(() => {
    // Devam eden akış/araç döngüsünü KES — aksi halde eski tur arka planda
    // sürmeye devam eder ve "yeni sohbet" tam hissettirmez.
    liveHelpers?.stop();
    // Özel grid görünümünü (set_grid_query) de sıfırla — tam temiz başlangıç
    void resetGridCustomView();
    useChatsStore.getState().newConversation();
  }, [liveHelpers]);

  const [helpersVersion, bump] = React.useReducer((x) => x + 1, 0);
  const lastSigRef = React.useRef("");

  const setLiveHelpersStable = React.useCallback((h: LiveHelpers) => {
    // Canlı akış parçaları (metin token'ları / araç çağrıları) geldikçe imza değişsin ve UI anında güncellensin
    const lastMsg = h.messages[h.messages.length - 1];
    const partsCount = lastMsg?.parts?.length ?? 0;
    const textLen = (lastMsg?.parts ?? []).reduce(
      (acc, p) => acc + (typeof (p as { text?: string }).text === "string" ? (p as { text?: string }).text!.length : 1),
      0
    );
    // Sohbet kimliği imzada: iki sohbet aynı görünümlü durumda olsa bile
    // geçişte panel mutlaka tazelensin (geçmişten açılan sohbetin görünmemesi)
    const sig = `${useChatsStore.getState().activeId}:${h.status}:${h.messages.length}:${partsCount}:${textLen}:${Boolean(h.error)}:${h.busy}`;
    // İmza değişmeden state GÜNCELLENMEZ: ChatInstance her render'da yeni bir
    // helpers objesi üretir; koşulsuz setState sonsuz döngü kurar.
    if (sig === lastSigRef.current) return;
    lastSigRef.current = sig;
    setLiveHelpers(h);
    bump();
  }, []);

  const isThinkingEnabled = useChatsStore((s) => s.isThinkingEnabled);
  const setThinkingEnabled = useChatsStore((s) => s.setThinkingEnabled);

  const value = React.useMemo<YulaChatContextValue | null>(() => {
    void helpersVersion; // sig/bump tetikleyicisi — canlı akış tazeliği
    if (!activeId || !liveHelpers) return null;
    return {
      ...liveHelpers,
      conversations,
      activeId,
      selectConversation,
      deleteConversation,
      newConversation,
      model,
      setModel,
      isThinkingEnabled,
      setThinkingEnabled,
    };
  }, [
	helpersVersion,
	liveHelpers,
	activeId,
	conversations,
	model,
	setModel,
	isThinkingEnabled,
	setThinkingEnabled,
	selectConversation,
	deleteConversation,
	newConversation
]);

  return (
    <>
      {activeId ? (
        <ChatInstance
          key={activeId}
          conversationId={activeId}
          onContextReady={setLiveHelpersStable}
        />
      ) : null}
      <YulaChatContext.Provider value={value}>
        {children}
      </YulaChatContext.Provider>
    </>
  );
}

// Not: Uygulama kabuğu (children) sohbet oturumundan BAĞIMSIZ render edilir;
// context null iken yalnızca sohbet paneli kendi içinde "hazırlanıyor" gösterir
// (AIChatPanel). Panel ~4 sn içinde hazır olmazsa "Uygulama yüklenemedi"
// durumuna düşer (hydration/oturum hatası ihtimali); yenileme aksiyonu sunar.
