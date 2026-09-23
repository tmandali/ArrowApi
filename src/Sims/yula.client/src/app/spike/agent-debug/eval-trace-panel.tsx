"use client";

import * as React from "react";
import type { EvalTestCase } from "@my-agent/core";
import {
  Terminal,
  Activity,
  Code2,
  Trash2,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Cpu,
  FileText,
  Copy,
  Check,
  X,
  Layers,
  Shield,
  Compass,
  Download,
  GitCompare,
} from "lucide-react";
import { EvalDiffInspector } from "./eval-diff-inspector";

export interface TraceEvent {
  id: string;
  type: "init" | "reasoning" | "tool_call" | "tool_result" | "text_delta" | "finish" | "error";
  timestamp: number;
  data: any;
}

export interface EvalTracePanelProps {
  events: TraceEvent[];
  isStreaming: boolean;
  activeCaseId: string | null;
  activeTestCase?: EvalTestCase | null;
  onClear: () => void;
  onClose?: () => void;
}

export function EvalTracePanel({
  events,
  isStreaming,
  activeCaseId,
  activeTestCase,
  onClear,
  onClose,
}: EvalTracePanelProps) {
  const [activeTab, setActiveTab] = React.useState<"timeline" | "diff" | "context" | "prompt" | "tools">("timeline");
  const [copiedKey, setCopiedKey] = React.useState<string | null>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (scrollRef.current && activeTab === "timeline") {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events, activeTab]);

  const copyToClipboard = React.useCallback(async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1500);
    } catch {
      setCopiedKey(null);
    }
  }, []);

  const exportTraceJson = React.useCallback(() => {
    if (events.length === 0) return;
    const blob = new Blob([JSON.stringify(events, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `eval-trace-${activeCaseId || "session"}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [events, activeCaseId]);

  const latestInit = React.useMemo(() => {
    for (let i = events.length - 1; i >= 0; i--) {
      if (events[i].type === "init") return events[i].data;
    }
    return null;
  }, [events]);

  const latestFinish = React.useMemo(() => {
    for (let i = events.length - 1; i >= 0; i--) {
      if (events[i].type === "finish") return events[i].data;
    }
    return null;
  }, [events]);

  const toolCalls = React.useMemo(() => {
    return events.filter((e) => e.type === "tool_call");
  }, [events]);

  const extractedActions = React.useMemo(() => {
    if (latestFinish?.dispatchedActions?.length) return latestFinish.dispatchedActions;
    return toolCalls.map((tc) => ({
      componentId: tc.data.componentId,
      action: tc.data.action,
      payload: tc.data.payload,
    }));
  }, [latestFinish, toolCalls]);

  const contextData = latestInit?.context ?? null;

  return (
    <div className="flex flex-col h-full border rounded-xl bg-card shadow-sm overflow-hidden text-xs">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-3 py-2 bg-muted/30">
        <div className="flex items-center gap-2">
          <Terminal className="h-4 w-4 text-emerald-500" />
          <span className="font-semibold text-sm">Canlı LLM Trace</span>
          {isStreaming ? (
            <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-ping" />
              Çalışıyor
            </span>
          ) : (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-muted text-muted-foreground">
              Hazır
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          {activeCaseId && (
            <span className="text-[10px] font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded">
              {activeCaseId}
            </span>
          )}
          <button
            onClick={exportTraceJson}
            disabled={events.length === 0}
            title="Trace İndir (.json)"
            className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
          >
            <Download className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onClear}
            title="Logları Temizle"
            className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
          {onClose && (
            <button
              onClick={onClose}
              title="Paneli Kapat"
              className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center border-b bg-muted/10 px-3 gap-1 py-1 overflow-x-auto">
        <button
          onClick={() => setActiveTab("timeline")}
          className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-colors ${
            activeTab === "timeline" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
          }`}
        >
          <Activity className="h-3 w-3" />
          Akış ({events.length})
        </button>
        <button
          onClick={() => setActiveTab("diff")}
          className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-colors ${
            activeTab === "diff" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
          }`}
        >
          <GitCompare className="h-3 w-3" />
          Fark (Diff)
        </button>
        <button
          onClick={() => setActiveTab("context")}
          className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-colors ${
            activeTab === "context" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
          }`}
        >
          <Layers className="h-3 w-3" />
          Bağlam
        </button>
        <button
          onClick={() => setActiveTab("prompt")}
          className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-colors ${
            activeTab === "prompt" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
          }`}
        >
          <FileText className="h-3 w-3" />
          Prompt
        </button>
        <button
          onClick={() => setActiveTab("tools")}
          className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-colors ${
            activeTab === "tools" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
          }`}
        >
          <Code2 className="h-3 w-3" />
          Araçlar ({toolCalls.length})
        </button>
      </div>

      {/* Body Content */}
      <div ref={scrollRef} className="flex-1 p-3 overflow-y-auto font-mono space-y-3">
        {events.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 text-muted-foreground">
            <Cpu className="h-8 w-8 mb-2 opacity-40" />
            <p className="text-xs font-semibold">Henüz canlı LLM trace kaydı yok</p>
            <p className="text-[11px] mt-1 max-w-xs text-muted-foreground">
              &quot;LLM Kullan (Canlı)&quot; açıkken bir test kartındaki &quot;Çalıştır&quot; butonuna basarak modelin düşünce, araç çağrısı, bağlam ve yanıt akışını burada canlı izleyebilirsiniz.
            </p>
          </div>
        ) : activeTab === "timeline" ? (
          <div className="space-y-2">
            {events.map((ev) => {
              if (ev.type === "init") {
                return (
                  <div key={ev.id} className="p-2.5 rounded-lg border bg-amber-500/5 border-amber-500/20 text-foreground">
                    <div className="flex items-center justify-between text-[11px] font-semibold text-amber-600 dark:text-amber-400 mb-1">
                      <span className="flex items-center gap-1.5">
                        <Sparkles className="h-3 w-3" /> PROMPT & BAĞLAM YÜKLENDİ
                      </span>
                      <span className="text-[10px] text-muted-foreground font-normal">
                        {ev.data.provider} / {ev.data.model}
                      </span>
                    </div>
                    {ev.data.context && (
                      <div className="flex items-center gap-2 mb-1.5 text-[10px]">
                        <span className="px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 font-semibold">
                          Çalışma Alanı: {ev.data.context.workspace}
                        </span>
                        <span className="text-muted-foreground">{ev.data.context.route}</span>
                      </div>
                    )}
                    <div className="p-1.5 bg-background rounded border text-[11px] text-muted-foreground">
                      &ldquo;{ev.data.userPrompt}&rdquo;
                    </div>
                  </div>
                );
              }

              if (ev.type === "reasoning") {
                return (
                  <div key={ev.id} className="p-2.5 rounded-lg border bg-purple-500/5 border-purple-500/20">
                    <div className="text-[10px] font-semibold text-purple-600 dark:text-purple-400 mb-1">
                      DÜŞÜNCE / REASONING
                    </div>
                    <div className="text-[11px] text-muted-foreground whitespace-pre-wrap">{ev.data.delta}</div>
                  </div>
                );
              }

              if (ev.type === "tool_call") {
                return (
                  <div key={ev.id} className="p-2.5 rounded-lg border bg-blue-500/5 border-blue-500/20">
                    <div className="flex items-center justify-between text-[10px] font-semibold text-blue-600 dark:text-blue-400 mb-1">
                      <span>⚡ ARAÇ ÇAĞRISI (TOOL CALL)</span>
                      <span className="text-[9px] px-1.5 py-0.2 rounded bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300">
                        {ev.data.status}
                      </span>
                    </div>
                    <div className="text-[11px] font-semibold text-foreground">
                      {ev.data.componentId} <span className="text-muted-foreground font-normal">➔</span> {ev.data.action}
                    </div>
                    {ev.data.payload && Object.keys(ev.data.payload).length > 0 && (
                      <pre className="mt-1.5 p-1.5 rounded bg-background border text-[10px] overflow-x-auto text-emerald-600 dark:text-emerald-400">
                        {JSON.stringify(ev.data.payload, null, 2)}
                      </pre>
                    )}
                  </div>
                );
              }

              if (ev.type === "text_delta") {
                return (
                  <div key={ev.id} className="p-2.5 rounded-lg border bg-card text-foreground">
                    <div className="text-[10px] font-semibold text-muted-foreground mb-1">MODEL YANITI (STREAM)</div>
                    <div className="text-[11px] leading-relaxed whitespace-pre-wrap">{ev.data.delta}</div>
                  </div>
                );
              }

              if (ev.type === "finish") {
                return (
                  <div key={ev.id} className="p-2.5 rounded-lg border bg-emerald-500/5 border-emerald-500/20 text-foreground">
                    <div className="flex items-center justify-between text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 mb-1">
                      <span className="flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" /> KOŞUM TAMAMLANDI
                      </span>
                      <span>{ev.data.durationMs}ms</span>
                    </div>
                    {ev.data.responseMessage && (
                      <div className="mt-1 text-[11px] text-muted-foreground">{ev.data.responseMessage}</div>
                    )}
                  </div>
                );
              }

              if (ev.type === "error") {
                return (
                  <div key={ev.id} className="p-2.5 rounded-lg border bg-rose-500/5 border-rose-500/20 text-rose-500">
                    <div className="flex items-center gap-1 text-[10px] font-semibold mb-1">
                      <AlertCircle className="h-3 w-3" /> MODEL / BAĞLANTI HATASI
                    </div>
                    <div className="text-[11px]">{ev.data.message}</div>
                  </div>
                );
              }

              return null;
            })}
          </div>
        ) : activeTab === "diff" ? (
          activeTestCase ? (
            <EvalDiffInspector
              testCase={activeTestCase}
              actualActions={extractedActions}
              responseMessage={latestFinish?.responseMessage || ""}
            />
          ) : (
            <div className="text-muted-foreground text-center py-6">Aktif test vakası seçilmedi.</div>
          )
        ) : activeTab === "context" ? (
          contextData ? (
            <div className="space-y-3">
              <div className="p-2.5 rounded-lg border bg-muted/30 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-semibold uppercase text-muted-foreground">Aktif Ekran & Alan</span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                    {contextData.category}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div className="flex items-center gap-1.5 text-foreground">
                    <Compass className="h-3.5 w-3.5 text-primary" />
                    <span>Alan: <strong>{contextData.workspace}</strong></span>
                  </div>
                  <div className="flex items-center gap-1.5 text-foreground">
                    <Layers className="h-3.5 w-3.5 text-primary" />
                    <span className="truncate">Rota: <code className="text-[10px]">{contextData.route}</code></span>
                  </div>
                </div>
              </div>

              {contextData.guardrails?.length > 0 && (
                <div className="space-y-1">
                  <div className="flex items-center gap-1 text-[11px] font-semibold text-foreground">
                    <Shield className="h-3.5 w-3.5 text-amber-500" />
                    <span>Uygulanan Güvenlik Politikaları & Kurallar:</span>
                  </div>
                  <ul className="space-y-1 pl-4 list-disc text-[10px] text-muted-foreground">
                    {contextData.guardrails.map((g: string, i: number) => (
                      <li key={i}>{g}</li>
                    ))}
                  </ul>
                </div>
              )}

              {contextData.forbiddenActions?.length > 0 && (
                <div className="p-2 rounded border bg-rose-500/10 border-rose-500/20 text-rose-600 dark:text-rose-400 space-y-1">
                  <span className="font-semibold text-[10px]">🚫 Yasaklı Araç Eylemleri (Negative Guard):</span>
                  <div className="space-y-0.5 text-[10px] font-mono">
                    {contextData.forbiddenActions.map((f: { componentId: string; action: string }, i: number) => (
                      <div key={i}>{f.componentId} ➔ {f.action}</div>
                    ))}
                  </div>
                </div>
              )}

              {contextData.expectedAction && (
                <div className="p-2 rounded border bg-blue-500/10 border-blue-500/20 text-blue-600 dark:text-blue-400 space-y-1">
                  <span className="font-semibold text-[10px]">⚡ Beklenen Eylem (Positive Target):</span>
                  <div className="text-[10px] font-mono">
                    {contextData.expectedAction.componentId} ➔ {contextData.expectedAction.action}
                  </div>
                </div>
              )}

              <div>
                <div className="flex items-center justify-between text-[11px] font-semibold text-foreground mb-1">
                  <span>Ham Bağlam Snapshot (JSON):</span>
                  <button
                    onClick={() => copyToClipboard(JSON.stringify(contextData, null, 2), "raw_context")}
                    className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
                  >
                    {copiedKey === "raw_context" ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                    Kopyala
                  </button>
                </div>
                <pre className="p-2 bg-muted/40 rounded border text-[10px] text-muted-foreground overflow-x-auto max-h-56">
                  {JSON.stringify(contextData, null, 2)}
                </pre>
              </div>
            </div>
          ) : (
            <div className="text-muted-foreground text-center py-6">Bağlam (Context) verisi bulunamadı.</div>
          )
        ) : activeTab === "prompt" ? (
          latestInit ? (
            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between text-[11px] font-semibold text-foreground mb-1">
                  <span>Kullanıcı Promptu (User Request):</span>
                  <button
                    onClick={() => copyToClipboard(latestInit.userPrompt, "user_prompt")}
                    className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
                  >
                    {copiedKey === "user_prompt" ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                    Kopyala
                  </button>
                </div>
                <div className="p-2 bg-muted/40 rounded border text-muted-foreground">{latestInit.userPrompt}</div>
              </div>

              <div>
                <div className="flex items-center justify-between text-[11px] font-semibold text-foreground mb-1">
                  <span>Sistem Kuralları & Güvenlik Politikaları (System Prompt):</span>
                  <button
                    onClick={() => copyToClipboard(latestInit.systemPrompt, "system_prompt")}
                    className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
                  >
                    {copiedKey === "system_prompt" ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                    Kopyala
                  </button>
                </div>
                <pre className="p-2.5 bg-muted/40 rounded border text-[10px] text-muted-foreground whitespace-pre-wrap leading-relaxed max-h-96 overflow-y-auto">
                  {latestInit.systemPrompt}
                </pre>
              </div>
            </div>
          ) : (
            <div className="text-muted-foreground text-center py-6">Prompt verisi bulunamadı.</div>
          )
        ) : (
          toolCalls.length > 0 ? (
            <div className="space-y-2">
              {toolCalls.map((tc, idx) => (
                <div key={idx} className="p-2.5 rounded-lg border bg-muted/20 space-y-1">
                  <div className="flex items-center justify-between text-[11px] font-semibold">
                    <span className="text-primary">{tc.data.componentId}</span>
                    <span className="text-muted-foreground font-mono">{tc.data.action}</span>
                  </div>
                  <pre className="p-2 bg-background rounded border text-[10px] text-emerald-600 dark:text-emerald-400 overflow-x-auto">
                    {JSON.stringify(tc.data.payload, null, 2)}
                  </pre>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-muted-foreground text-center py-6">Bu koşumda henüz araç tetiklenmedi.</div>
          )
        )}
      </div>

      {/* Token Telemetry Footer */}
      {latestFinish && (
        <div className="border-t px-3 py-1.5 bg-muted/40 flex items-center justify-between text-[10px] text-muted-foreground">
          <div className="flex items-center gap-2.5 font-mono">
            <span>⏱️ <strong>{latestFinish.durationMs}ms</strong></span>
            {latestFinish.usage && (
              <>
                <span>📥 In: <strong>{latestFinish.usage.promptTokens}</strong></span>
                <span>📤 Out: <strong>{latestFinish.usage.completionTokens}</strong></span>
                <span>🔢 Tot: <strong>{latestFinish.usage.totalTokens}</strong></span>
              </>
            )}
          </div>
          <div className="font-semibold text-foreground">
            {latestFinish.provider} / {latestFinish.model}
          </div>
        </div>
      )}
    </div>
  );
}
