"use client";

import * as React from "react";
import {
  erpEnterpriseEvalSuite,
  evalRunner,
  computeEvalLift,
  type EvalTestCase,
  type EvalSuiteResult,
  type EvalCaseResult,
  type EvalExecutionResult,
} from "@my-agent/core";
import {
  Play,
  ShieldCheck,
  Activity,
  TrendingUp,
  RefreshCw,
  Bot,
  Sparkles,
  Terminal,
  CheckCircle2,
} from "lucide-react";
import { EvalTracePanel, type TraceEvent } from "./eval-trace-panel";
import { resolveEvalContext, simulateErpExecution } from "./eval-context-resolver";
import { EvalModelSelect } from "./eval-model-select";
import { EvalScenarioCard } from "./eval-scenario-card";

async function executeWithLlm(
  testCase: EvalTestCase,
  onEvent: (ev: TraceEvent) => void,
  provider?: string,
  model?: string,
): Promise<{ execution: EvalExecutionResult; durationMs: number; model?: string }> {
  const t0 = performance.now();
  let dispatchedActions: Array<{ componentId: string; action: string; payload?: any }> = [];
  let responseMessage = "";
  let durationMs = 0;
  let modelName = "";

  try {
    const res = await fetch("/api/agent/eval", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: testCase.prompt,
        testCaseId: testCase.id,
        context: resolveEvalContext(testCase),
        provider,
        model,
      }),
    });

    if (!res.body) throw new Error("Akış yanıtı alınamadı");
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split("\n\n");
      buffer = blocks.pop() || "";

      for (const block of blocks) {
        if (!block.trim()) continue;
        const evMatch = block.match(/^event:\s*(\w+)/m);
        const dataMatch = block.match(/^data:\s*(.*)$/m);
        if (!evMatch || !dataMatch) continue;

        const type = evMatch[1] as TraceEvent["type"];
        let data: any = {};
        try { data = JSON.parse(dataMatch[1]); } catch { data = dataMatch[1]; }

        onEvent({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, type, timestamp: Date.now(), data });

        if (type === "tool_call" && data.componentId && data.action) {
          dispatchedActions.push({ componentId: data.componentId, action: data.action, payload: data.payload });
        } else if (type === "finish") {
          if (data.dispatchedActions?.length) dispatchedActions = data.dispatchedActions;
          responseMessage = data.responseMessage || "";
          durationMs = data.durationMs || Math.round(performance.now() - t0);
          modelName = data.model || "";
        }
      }
    }

    if (!durationMs) durationMs = Math.round(performance.now() - t0);
    return { execution: { dispatchedActions, responseMessage }, durationMs, model: modelName };
  } catch (err) {
    const dur = Math.round(performance.now() - t0);
    return {
      execution: { dispatchedActions: [], responseMessage: "", error: err instanceof Error ? err.message : String(err) },
      durationMs: dur,
    };
  }
}

export function ErpEvalsBench() {
  const [filter, setFilter] = React.useState<"all" | "positive_action" | "negative_guard">("all");
  const [useLlm, setUseLlm] = React.useState(false);
  const [selectedProvider, setSelectedProvider] = React.useState<string>("ollama");
  const [selectedModel, setSelectedModel] = React.useState<string>("");
  const [showTrace, setShowTrace] = React.useState(true);
  const [traceEvents, setTraceEvents] = React.useState<TraceEvent[]>([]);
  const [results, setResults] = React.useState<EvalSuiteResult | null>(null);
  const [caseResults, setCaseResults] = React.useState<EvalCaseResult[]>([]);
  const [runningCaseId, setRunningCaseId] = React.useState<string | null>(null);
  const [isRunningAll, setIsRunningAll] = React.useState(false);
  const [selectedCaseId, setSelectedCaseId] = React.useState<string | null>(null);

  const displayedCases = React.useMemo(() => {
    if (filter === "all") return erpEnterpriseEvalSuite;
    return erpEnterpriseEvalSuite.filter((c) => c.category === filter);
  }, [filter]);

  const activeTestCase = React.useMemo(() => {
    const targetId = runningCaseId || selectedCaseId;
    return erpEnterpriseEvalSuite.find((c) => c.id === targetId) || displayedCases[0] || null;
  }, [runningCaseId, selectedCaseId, displayedCases]);

  const handleTraceEvent = React.useCallback((ev: TraceEvent) => {
    setTraceEvents((prev) => {
      if (ev.type === "text_delta" || ev.type === "reasoning") {
        const last = prev[prev.length - 1];
        if (last && last.type === ev.type) {
          return [...prev.slice(0, -1), { ...last, data: { delta: (last.data.delta || "") + ev.data.delta } }];
        }
      }
      return [...prev, ev];
    });
  }, []);

  const recomputeSuiteMetrics = React.useCallback((currentCases: EvalCaseResult[]) => {
    if (currentCases.length === 0) return;
    const total = currentCases.length;
    const passed = currentCases.filter((c) => c.passed).length;
    const acceptable = currentCases.filter((c) => c.acceptableScore === 1).length;
    const toolChoice = currentCases.filter((c) => c.correctToolChoice).length;
    const toolArgs = currentCases.filter((c) => c.correctToolArguments).length;
    const finalDec = currentCases.filter((c) => c.correctFinalDecision).length;
    const durationMs = currentCases.reduce((acc, c) => acc + c.durationMs, 0);

    setResults({
      total,
      passed,
      failed: total - passed,
      passRate: (passed / total) * 100,
      acceptableRate: (acceptable / total) * 100,
      toolChoiceRate: (toolChoice / total) * 100,
      toolArgumentsRate: (toolArgs / total) * 100,
      finalDecisionRate: (finalDec / total) * 100,
      hallucinationRate: 0,
      toolRepetitionRate: 0,
      durationMs,
      results: currentCases,
    });
  }, []);

  const runSingleEval = React.useCallback(
    async (tc: EvalTestCase) => {
      setRunningCaseId(tc.id);
      setSelectedCaseId(tc.id);
      if (useLlm) setShowTrace(true);
      try {
        let exec: EvalExecutionResult;
        let durationMs: number;

        if (useLlm) {
          const llmRes = await executeWithLlm(tc, handleTraceEvent, selectedProvider, selectedModel);
          exec = llmRes.execution;
          durationMs = llmRes.durationMs;
        } else {
          const t0 = performance.now();
          await new Promise((r) => setTimeout(r, 35));
          exec = simulateErpExecution(tc);
          durationMs = Math.round(performance.now() - t0);
        }

        const caseRes = evalRunner.evaluateExecution(tc, exec, durationMs);
        setCaseResults((prev) => {
          const updated = [...prev.filter((r) => r.id !== tc.id), caseRes];
          recomputeSuiteMetrics(updated);
          return updated;
        });
      } finally {
        setRunningCaseId(null);
      }
    },
    [useLlm, handleTraceEvent, selectedProvider, selectedModel, recomputeSuiteMetrics],
  );

  const runAllEvals = React.useCallback(async () => {
    setIsRunningAll(true);
    if (useLlm) setShowTrace(true);
    try {
      const updatedList: EvalCaseResult[] = [];
      for (const tc of erpEnterpriseEvalSuite) {
        setRunningCaseId(tc.id);
        setSelectedCaseId(tc.id);
        let exec: EvalExecutionResult;
        let durationMs: number;

        if (useLlm) {
          const llmRes = await executeWithLlm(tc, handleTraceEvent, selectedProvider, selectedModel);
          exec = llmRes.execution;
          durationMs = llmRes.durationMs;
        } else {
          const t0 = performance.now();
          await new Promise((r) => setTimeout(r, 20));
          exec = simulateErpExecution(tc);
          durationMs = Math.round(performance.now() - t0);
        }

        const caseRes = evalRunner.evaluateExecution(tc, exec, durationMs);
        updatedList.push(caseRes);
        setCaseResults([...updatedList]);
      }
      recomputeSuiteMetrics(updatedList);
    } finally {
      setRunningCaseId(null);
      setIsRunningAll(false);
    }
  }, [useLlm, handleTraceEvent, selectedProvider, selectedModel, recomputeSuiteMetrics]);

  const lift = React.useMemo(() => {
    if (!results) return null;
    return computeEvalLift({ ...results, acceptableRate: 80, passRate: 75, toolChoiceRate: 85 }, results);
  }, [results]);

  return (
    <div className="flex h-full w-full max-w-[1600px] mx-auto p-4 gap-4 overflow-hidden">
      {/* Left: Main Evals Suite Bench */}
      <div className="flex-1 overflow-y-auto space-y-6 pr-1">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b pb-4 gap-4">
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2">
              <ShieldCheck className="h-6 w-6 text-emerald-600" />
              ERP Enterprise Eval Suite & Benchmark (ServiceNow AgentArch)
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Satınalma, yetki sınırları, DuckDB analitiği ve ArrowJobs için 12 kritik güvenlik ve eylem test vakası.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <label className="flex items-center gap-2 text-xs font-semibold px-3 py-2 bg-muted/60 hover:bg-muted rounded-lg border cursor-pointer transition-colors">
              <input
                type="checkbox"
                checked={useLlm}
                onChange={(e) => {
                  setUseLlm(e.target.checked);
                  if (e.target.checked) setShowTrace(true);
                }}
                className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 h-4 w-4"
              />
              {useLlm ? (
                <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-bold">
                  <Sparkles className="h-3.5 w-3.5" /> LLM Kullan (Canlı)
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <Bot className="h-3.5 w-3.5" /> Mock Simülasyon
                </span>
              )}
            </label>

            {useLlm && (
              <EvalModelSelect
                selectedProvider={selectedProvider}
                selectedModel={selectedModel}
                onSelect={(p, m) => {
                  setSelectedProvider(p);
                  setSelectedModel(m);
                }}
                disabled={isRunningAll || runningCaseId !== null}
              />
            )}

            <button
              onClick={() => setShowTrace(!showTrace)}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border transition-colors ${
                showTrace ? "bg-primary text-primary-foreground" : "bg-muted/60 text-muted-foreground hover:bg-muted"
              }`}
            >
              <Terminal className="h-3.5 w-3.5" />
              Trace Paneli
              {traceEvents.length > 0 && (
                <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-background/20 font-bold">
                  {traceEvents.length}
                </span>
              )}
            </button>

            <button
              onClick={runAllEvals}
              disabled={isRunningAll || runningCaseId !== null}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium shadow-sm transition-all disabled:opacity-50 text-xs sm:text-sm"
            >
              {isRunningAll ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4 fill-white" />}
              {isRunningAll ? "Koşuluyor..." : "Tüm Evals Koş"}
            </button>
          </div>
        </div>

        {/* Metrics Row */}
        {results && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="border rounded-xl p-4 bg-card shadow-sm">
              <div className="flex items-center justify-between text-muted-foreground text-xs uppercase font-medium">
                <span>Kabul Skoru (AgentArch)</span>
                <Activity className="h-4 w-4 text-emerald-500" />
              </div>
              <div className="text-2xl font-bold mt-2 text-emerald-600">%{results.acceptableRate.toFixed(1)}</div>
              <div className="text-xs text-muted-foreground mt-1">C(r) · A(r) · O(r) bileşik metrik</div>
            </div>

            <div className="border rounded-xl p-4 bg-card shadow-sm">
              <div className="flex items-center justify-between text-muted-foreground text-xs uppercase font-medium">
                <span>Güvenlik Duvarı</span>
                <ShieldCheck className="h-4 w-4 text-blue-500" />
              </div>
              <div className="text-2xl font-bold mt-2 text-blue-600">%{results.passRate.toFixed(1)}</div>
              <div className="text-xs text-muted-foreground mt-1">Negative guardrails koruması</div>
            </div>

            <div className="border rounded-xl p-4 bg-card shadow-sm">
              <div className="flex items-center justify-between text-muted-foreground text-xs uppercase font-medium">
                <span>Araç & Argüman</span>
                <CheckCircle2 className="h-4 w-4 text-indigo-500" />
              </div>
              <div className="text-2xl font-bold mt-2 text-indigo-600">
                %{results.toolChoiceRate.toFixed(1)} / %{results.toolArgumentsRate.toFixed(1)}
              </div>
              <div className="text-xs text-muted-foreground mt-1">Seçim & Argüman Doğruluğu</div>
            </div>

            <div className="border rounded-xl p-4 bg-card shadow-sm">
              <div className="flex items-center justify-between text-muted-foreground text-xs uppercase font-medium">
                <span>Benchmark Lift</span>
                <TrendingUp className="h-4 w-4 text-amber-500" />
              </div>
              <div className="text-2xl font-bold mt-2 text-amber-600">+{lift?.acceptableLiftRate.toFixed(1)}%</div>
              <div className="text-xs text-muted-foreground mt-1">Temel baseline&apos;a kıyasla artış</div>
            </div>
          </div>
        )}

        {/* Filter Chips */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground font-medium">Filtre:</span>
          {(["all", "positive_action", "negative_guard"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                filter === f ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              }`}
            >
              {f === "all" ? `Tümü (${erpEnterpriseEvalSuite.length})` : f === "positive_action" ? "Pozitif Eylemler" : "🛡️ Güvenlik Korumaları"}
            </button>
          ))}
        </div>

        {/* Cases Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {displayedCases.map((tc) => (
            <EvalScenarioCard
              key={tc.id}
              testCase={tc}
              caseResult={caseResults.find((r) => r.id === tc.id)}
              isRunning={runningCaseId === tc.id}
              isRunningAll={isRunningAll}
              isSelected={selectedCaseId === tc.id}
              onRun={runSingleEval}
              onSelect={(selected) => setSelectedCaseId(selected.id)}
            />
          ))}
        </div>
      </div>

      {/* Right: Live LLM Trace Panel */}
      {showTrace && (
        <div className="w-[440px] xl:w-[480px] h-full flex-shrink-0 flex flex-col">
          <EvalTracePanel
            events={traceEvents}
            isStreaming={runningCaseId !== null}
            activeCaseId={runningCaseId || selectedCaseId}
            activeTestCase={activeTestCase}
            onClear={() => setTraceEvents([])}
            onClose={() => setShowTrace(false)}
          />
        </div>
      )}
    </div>
  );
}
