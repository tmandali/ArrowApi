"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  useUserAgentsStore,
  ensureExampleAgent,
} from "@/lib/stores/user-agents";
import {
  buildUserAgentMarkdown,
  filterActiveToolsByAgent,
  lintAgentInstructions,
} from "@/lib/yula-user-agent";
import { getRailWorkspaces } from "@/lib/workspace-registry";
import type { RagVectorItem } from "@/services/duckdb-vector";

/**
 * Spike: custom agent (persona) + workspace RAG teşhisi.
 * "geçen haftanın satışlarını raporla" akışı neden 3 rapor sormuyor?
 * - Ajanın araç kesişimi (ask_user_question / navigate_to_page /
 *   get_report_schema kesilmiş mi?)
 * - Persona lint uyarıları (faz duvarı ihlali var mı?)
 * - RAG araması 3 adayı döndürüyor mu, cutoff'a mı takılıyor?
 */
const WORKSPACE_PHASE_TOOLS = [
  "get_report_schema",
  "run_job",
  "apply_criteria",
  "request_user_confirmation",
  "navigate_to_page",
  "open_last_report",
  "validate_criteria_input",
  "get_current_criteria",
  "list_report_executions",
  "find_matching_report",
  "cancel_job",
  "ask_user_question",
  "run_user_skill",
  "run_skill_script",
  "read_skill_file",
];

/** Beklenen akış için kritik araçlar (sor → şema → doldur → yönlendir → koş). */
const CRITICAL_TOOLS = [
  "ask_user_question",
  "navigate_to_page",
  "get_report_schema",
  "get_current_criteria",
  "validate_criteria_input",
  "apply_criteria",
  "find_matching_report",
  "run_job",
];

type RagRow = {
  scope: string;
  content: string;
  distance: number | null;
  tier?: string;
  workspace?: string;
  metaType?: string;
  title?: string;
  url?: string;
};

function toRagRow(item: RagVectorItem): RagRow {
  const meta = (item.metadata ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v : undefined);
  return {
    scope: item.scope,
    content: item.content,
    distance: typeof item.distance === "number" ? item.distance : null,
    tier: str((item as { tier?: unknown }).tier),
    workspace: str((item as { workspace?: unknown }).workspace),
    metaType: str(meta.type),
    title: str(meta.title) ?? str(meta.titleTr),
    url: str(meta.url) ?? str(meta.pathname),
  };
}

export function AgentDebugBench() {
  const agents = useUserAgentsStore((s) => s.agents);
  const activeAgentId = useUserAgentsStore((s) => s.activeAgentId);
  const [hydrated, setHydrated] = React.useState(false);
  const [selectedId, setSelectedId] = React.useState<string>("");
  const [query, setQuery] = React.useState(
    "geçen haftanın satışlarını raporla",
  );
  const [workspace, setWorkspace] = React.useState("stock");
  const [ragRows, setRagRows] = React.useState<RagRow[]>([]);
  const [ragMs, setRagMs] = React.useState<number | null>(null);
  const [ragError, setRagError] = React.useState<string | null>(null);
  const [ragRunning, setRagRunning] = React.useState(false);
  const [purgeInfo, setPurgeInfo] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState<string | null>(null);
  const railWorkspaces = React.useMemo(() => getRailWorkspaces(), []);

  React.useEffect(() => {
    ensureExampleAgent();
    const persistApi = useUserAgentsStore.persist;
    if (persistApi?.hasHydrated()) {
      setHydrated(true);
      return;
    }
    return persistApi?.onFinishHydration(() => setHydrated(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Seçim hydration sonrası dolar; effect yerine render'da türet
  // (set-state-in-effect zinciri olmasın).
  const resolvedId = selectedId || activeAgentId || agents[0]?.id || "";

  const agent = agents.find((a) => a.id === resolvedId) ?? null;
  const lintWarnings = React.useMemo(
    () => (agent ? lintAgentInstructions(agent.instructions) : []),
    [agent],
  );
  const effectiveTools = React.useMemo(
    () =>
      agent
        ? filterActiveToolsByAgent(
            WORKSPACE_PHASE_TOOLS,
            [],
            agent.tools,
          )
        : [],
    [agent],
  );
  const effectiveSet = React.useMemo(
    () => new Set(effectiveTools),
    [effectiveTools],
  );
  const missingCritical = React.useMemo(
    () =>
      !agent || agent.tools.length === 0
        ? []
        : CRITICAL_TOOLS.filter((t) => !effectiveSet.has(t)),
    [agent, effectiveSet],
  );
  const agentMd = React.useMemo(
    () =>
      agent
        ? buildUserAgentMarkdown({
            name: agent.name,
            description: agent.description,
            scope: agent.scope,
            provider: agent.provider,
            model: agent.model,
            thinking: agent.thinking,
            effort: agent.effort,
            tools: agent.tools,
            skills: agent.skills,
            instructions: agent.instructions,
          })
        : "",
    [agent],
  );

  const runRag = React.useCallback(async () => {
    const q = query.trim();
    if (!q || ragRunning) return;
    setRagRunning(true);
    setRagError(null);
    try {
      // Chat ile birebir aynı yol (tier-çeşitli seçim dahil).
      const { searchChatRagContext } = await import(
        "@/services/duckdb-vector"
      );
      const t0 = performance.now();
      const items = await searchChatRagContext(q, 3, {
        workspace: workspace || undefined,
      });
      setRagMs(Math.round(performance.now() - t0));
      setRagRows(items.map(toRagRow));
    } catch (err) {
      setRagError(err instanceof Error ? err.message : String(err));
      setRagRows([]);
    } finally {
      setRagRunning(false);
    }
  }, [query, workspace, ragRunning]);

  const purgeGhosts = React.useCallback(async () => {
    setPurgeInfo("Temizleniyor…");
    try {
      const [{ purgeOrphanConversationVectors }, { useChatsStore }] =
        await Promise.all([
          import("@/services/duckdb-vector"),
          import("@/lib/stores/chats"),
        ]);
      const existing = useChatsStore.getState().conversations.map((c) => c.id);
      const orphans = await purgeOrphanConversationVectors(existing);
      setPurgeInfo(
        orphans.length === 0
          ? "Hayalet vektör yok — tablo store ile uyumlu."
          : `${orphans.length} hayalet vektör temizlendi: ${orphans.slice(0, 5).join(", ")}${orphans.length > 5 ? "…" : ""}`,
      );
    } catch (err) {
      setPurgeInfo(`Temizlik hatası: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, []);

  const copyText = React.useCallback(async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      setCopied(null);
    }
  }, []);

  const bundle = React.useMemo(() => {
    if (!agent) return "";
    const lines = [
      `agent: ${agent.name} (${agent.id})`,
      `scope: ${agent.scope ?? "global"}`,
      `tools_allowlist: ${agent.tools.length === 0 ? "(boş = tüm araçlar)" : agent.tools.join(", ")}`,
      `effective_workspace_tools: ${effectiveTools.join(", ")}`,
      missingCritical.length > 0
        ? `missing_critical: ${missingCritical.join(", ")}`
        : "missing_critical: yok",
      lintWarnings.length > 0
        ? `lint:\n- ${lintWarnings.join("\n- ")}`
        : "lint: temiz",
      `rag_query: "${query}" (workspace=${workspace}, k=3, ${ragMs ?? "?"} ms)`,
      ...ragRows.map(
        (r, i) =>
          `rag[${i}]: scope=${r.scope} distance=${r.distance?.toFixed(3) ?? "?"} tier=${r.tier ?? "?"} ws=${r.workspace ?? "?"} type=${r.metaType ?? "?"} title=${r.title ?? "?"} url=${r.url ?? "?"}\n  ${r.content.slice(0, 220)}`,
      ),
      "",
      "--- agent.md ---",
      agentMd,
    ];
    return lines.join("\n");
  }, [
    agent,
    effectiveTools,
    missingCritical,
    lintWarnings,
    query,
    workspace,
    ragMs,
    ragRows,
    agentMd,
  ]);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-4 text-xs">
      <div>
        <h1 className="text-sm font-semibold">Agent + RAG debug (spike)</h1>
        <p className="text-muted-foreground">
          Custom persona neden 3 rapor sormuyor? Araç kesişimi, persona
          lint&apos;i ve workspace RAG adaylarını burada gör; çıktıyı
          kopyalayıp asistana yapıştır.
        </p>
      </div>

      {!hydrated ? (
        <div className="rounded-md border p-3 text-muted-foreground">
          Ajan deposu yükleniyor…
        </div>
      ) : agents.length === 0 ? (
        <div className="rounded-md border p-3 text-muted-foreground">
          Kayıtlı ajan yok — önce /system/agents ekranından bir ajan oluştur.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-2 rounded-md border p-3 md:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-muted-foreground">Ajan</span>
              <select
                className="h-8 rounded-md border bg-background px-2"
                value={resolvedId}
                onChange={(e) => setSelectedId(e.target.value)}
              >
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.scope ?? "global"})
                  </option>
                ))}
              </select>
            </label>
            <div className="flex flex-col gap-1">
              <span className="text-muted-foreground">Kapsam / sağlayıcı</span>
              <span className="h-8 truncate rounded-md border bg-muted/30 px-2 leading-8">
                {agent?.scope ?? "global"} ·{" "}
                {agent?.provider || "genel"} / {agent?.model || "varsayılan"}
              </span>
            </div>
          </div>

          <div className="rounded-md border p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="font-semibold">
                Workspace-fazı araç kesişimi
                {agent && agent.tools.length === 0
                  ? " (allowlist boş = tüm araçlar)"
                  : ""}
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void copyText(agentMd, "md")}
              >
                {copied === "md" ? "Kopyalandı ✓" : "agent.md kopyala"}
              </Button>
            </div>
            {missingCritical.length > 0 ? (
              <p className="mb-2 font-medium text-amber-700 dark:text-amber-300">
                ⚠ Eksik kritik araç: {missingCritical.join(", ")} — bu
                kesikse 3-rapor sorma / yönlendirme zinciri kırılır.
              </p>
            ) : (
              <p className="mb-2 text-muted-foreground">
                Kritik araçların tamamı açık.
              </p>
            )}
            <div className="flex flex-wrap gap-1.5">
              {WORKSPACE_PHASE_TOOLS.map((t) => {
                const open = effectiveSet.has(t);
                const critical = CRITICAL_TOOLS.includes(t);
                return (
                  <span
                    key={t}
                    title={critical ? "kritik" : undefined}
                    className={
                      open
                        ? "rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 font-mono"
                        : "rounded-md border border-red-500/40 bg-red-500/10 px-2 py-1 font-mono line-through opacity-70"
                    }
                  >
                    {critical ? "★ " : ""}
                    {t}
                  </span>
                );
              })}
            </div>
          </div>

          <div className="rounded-md border p-3">
            <div className="mb-1 font-semibold">Persona lint</div>
            {lintWarnings.length === 0 ? (
              <p className="text-muted-foreground">
                Temiz — faz duvarıyla çelişen dayatma yok.
              </p>
            ) : (
              <ul className="space-y-1">
                {lintWarnings.map((w) => (
                  <li
                    key={w.slice(0, 32)}
                    className="text-amber-700 dark:text-amber-300"
                  >
                    ⚠ {w}
                  </li>
                ))}
              </ul>
            )}
            {agent ? (
              <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded-md bg-muted/40 p-2 font-mono text-[11px] leading-4">
                {agent.instructions || "(boş talimat)"}
              </pre>
            ) : null}
          </div>
        </>
      )}

      <div className="rounded-md border p-3">
        <div className="mb-2 font-semibold">
          Workspace RAG testi (k=3, chat ile aynı arama)
        </div>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_10rem_auto]">
          <Input
            className="h-8"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="geçen haftanın satışlarını raporla"
          />
          <select
            className="h-8 rounded-md border bg-background px-2"
            value={workspace}
            onChange={(e) => setWorkspace(e.target.value)}
          >
            {railWorkspaces.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
          <Button
            type="button"
            size="sm"
            disabled={ragRunning || !query.trim()}
            onClick={() => void runRag()}
          >
            {ragRunning ? "Aranıyor…" : "RAG ara"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void purgeGhosts()}
          >
            Hayalet vektörleri temizle
          </Button>
        </div>
        {purgeInfo ? (
          <p className="mt-2 text-muted-foreground">{purgeInfo}</p>
        ) : null}
        {ragError ? (
          <p className="mt-2 text-red-600 dark:text-red-400">{ragError}</p>
        ) : null}
        {ragMs != null && !ragError ? (
          <p className="mt-2 text-muted-foreground">
            {ragRows.length} aday ({ragMs} ms)
            {ragRows.length === 0
              ? " — cutoff&apos;a takılmış olabilir, sorguyu kısaltıp tekrar dene."
              : ""}
          </p>
        ) : null}
        {ragRows.length > 0 ? (
          <div className="mt-2 flex flex-col gap-1.5">
            {ragRows.map((r, i) => (
              <div key={`${r.scope}-${i}`} className="rounded-md border p-2">
                <div className="font-mono font-semibold">
                  [{i}] {r.scope} · distance{" "}
                  {r.distance?.toFixed(3) ?? "?"} · {r.tier ?? "?"}/
                  {r.workspace ?? "?"} · {r.metaType ?? "?"}
                </div>
                {(r.title || r.url) && (
                  <div className="text-muted-foreground">
                    {r.title ?? ""} {r.url ? `→ ${r.url}` : ""}
                  </div>
                )}
                <div className="mt-1 whitespace-pre-wrap text-[11px] leading-4">
                  {r.content.slice(0, 400)}
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div className="rounded-md border p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="font-semibold">
            Teşhis paketi (asistana yapıştır)
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!bundle}
            onClick={() => void copyText(bundle, "bundle")}
          >
            {copied === "bundle" ? "Kopyalandı ✓" : "Paketi kopyala"}
          </Button>
        </div>
        <pre className="max-h-64 overflow-auto whitespace-pre-wrap font-mono text-[11px] leading-4">
          {bundle || "—"}
        </pre>
      </div>
    </div>
  );
}
