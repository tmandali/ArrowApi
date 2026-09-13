import { DefaultChatTransport } from "ai";
import { isYulaGridSlashPrompt } from "@/components/layout/yula-commands";
import type { YulaCommand } from "@/components/layout/yula-commands";
import {
  isWorkspaceHomePath,
  workspaceIdFromPath,
  workspaceLabelFromPath,
  extractJobIdFromHref,
  extractAgentIdFromPath,
} from "@/lib/workspace-paths";
import { useChatsStore } from "@/lib/stores/chats";
import { useUserSkillsStore } from "@/lib/stores/user-skills";
import { BUILT_IN_USER_SKILLS } from "@/lib/built-in-skills";
import { getAllUserSkillsInventory, getEffectiveUserSkills } from "@/lib/yula-user-skill";
import { useUserAgentsStore } from "@/lib/stores/user-agents";
import { agentScopeWorkspaceId, filterAgentsByScope } from "@/lib/yula-user-agent";
import { upsertTurnTrace } from "@/lib/yula-turn-trace";
import { useYulaGridStore } from "@/lib/stores/grid";
import { useActiveJobsStore, isTerminalJobStatus } from "@/store/slices/active-jobs-store";
import { useDraftCriteriaStore } from "@/store/slices/draft-criteria-store";
import { slimMessagesForTransport } from "@/lib/context-slim";
import {
  snapshotScreenState,
  diffScreenSnapshots,
} from "@/lib/screen-snapshot";
import { readYulaClientAiConfig } from "@/lib/yula-ai-client-config";
import {
  markRequestStart,
  getActiveConversationId,
  lastScreenSnapshots,
  resolveCurrentAgentId,
  customFetchWithTimeout,
} from "./chat-shared";

/**
 * Mount-snapshot transport kurucusu — orijinal ChatInstance useMemo gövdesinin
 * birebir taşınmış hali. locale değişince (stabil string) çağrıcı yeniden kurar.
 */
export function buildYulaTransport(localizedGridCommands: YulaCommand[]) {
  return new DefaultChatTransport({
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
      // F5 sonrası store boştur: odaktaki job'ın gerçek durumunu
      // backend'den çöz (best-effort, 4sn). Failed/Cancelled ise faz
      // workspace'e düşer, model "bekle" yerine yeni job açar.
      let resolvedFocusedStatus: string | undefined = jobIdSeg
        ? useActiveJobsStore.getState().jobs[jobIdSeg]?.status
        : undefined;
      if (jobIdSeg && !resolvedFocusedStatus) {
        try {
          const { fetchJobStatus } = await import(
            "@/features/jobs/arrow-job-client"
          );
          const fresh = await fetchJobStatus(
            jobIdSeg,
            AbortSignal.timeout(4000),
          );
          if (fresh?.status) {
            resolvedFocusedStatus = fresh.status;
            useActiveJobsStore
              .getState()
              .updateJob(jobIdSeg, { status: fresh.status });
          }
        } catch {
          // Backend'e ulaşılamazsa store'daki bilgiyle devam.
        }
      }

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
      // Terminal-failed job: tablo asla gelmeyecek — "yükleniyor" değil,
      // yeni job kurulabilen workspace fazı (re-run için run_job gerekir).
      // Completed kapı dışı: tablosu henüz hidratlanıyor olabilir.
      const focusedJobStatus = resolvedFocusedStatus;
      const isFailedFocusedJob =
        !hasActiveGrid &&
        Boolean(jobIdSeg) &&
        Boolean(focusedJobStatus) &&
        isTerminalJobStatus(focusedJobStatus) &&
        focusedJobStatus !== "Completed";

      const phase: "results" | "results-loading" | "workspace" =
        hasActiveGrid
          ? "results"
          : jobDetail && !isFailedFocusedJob
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
      const gridPrompt = isYulaGridSlashPrompt(lastText, localizedGridCommands);
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
        focusedJobStatus: resolvedFocusedStatus,
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
  });
}
