"use client";

import * as React from "react";
import type { EvalTestCase, EvalCaseResult } from "@my-agent/core";
import {
  Play,
  CheckCircle2,
  XCircle,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Info,
  Shield,
  Layers,
  Compass,
} from "lucide-react";
import { resolveEvalContext } from "./eval-context-resolver";
import { EvalDiffInspector } from "./eval-diff-inspector";

export interface EvalScenarioCardProps {
  testCase: EvalTestCase;
  caseResult?: EvalCaseResult;
  isRunning: boolean;
  isRunningAll: boolean;
  isSelected: boolean;
  onRun: (testCase: EvalTestCase) => void;
  onSelect: (testCase: EvalTestCase) => void;
}

const WORKSPACE_LABELS: Record<string, string> = {
  procurement: "Satınalma",
  stock: "Stok & Depo",
  analytics: "DuckDB Analitik",
  jobs: "ArrowJobs",
  sales: "Satış & Dal",
  finance: "Muhasebe",
  crm: "Kredi Risk",
  hr: "İK & Bordro",
};

export function EvalScenarioCard({
  testCase,
  caseResult,
  isRunning,
  isRunningAll,
  isSelected,
  onRun,
  onSelect,
}: EvalScenarioCardProps) {
  const [expanded, setExpanded] = React.useState(false);
  const context = React.useMemo(() => resolveEvalContext(testCase), [testCase]);
  const isNegativeGuard = testCase.category === "negative_guard";
  const wsLabel = WORKSPACE_LABELS[context.workspace] || context.workspace;

  return (
    <div
      onClick={() => onSelect(testCase)}
      className={`border rounded-xl p-4 bg-card shadow-sm flex flex-col justify-between transition-all cursor-pointer ${
        isSelected
          ? "border-primary ring-2 ring-primary/20 bg-muted/10"
          : isRunning
            ? "border-emerald-500 ring-2 ring-emerald-500/20"
            : "hover:border-emerald-500/50"
      }`}
    >
      <div>
        {/* Top Header Row */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span
              className={`text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full ${
                isNegativeGuard
                  ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                  : "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300"
              }`}
            >
              {isNegativeGuard ? "🛡️ Negatif Koruma" : "⚡ Pozitif Eylem"}
            </span>

            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
              {wsLabel}
            </span>

            <span className="text-[10px] font-mono text-muted-foreground">
              {testCase.id}
            </span>
          </div>

          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
            {caseResult && (
              <span className="flex items-center gap-1 text-xs font-medium text-emerald-600">
                {caseResult.passed ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5 text-rose-500" />}
                {caseResult.passed ? "Geçti" : "Başarısız"}
              </span>
            )}

            <button
              onClick={() => onRun(testCase)}
              disabled={isRunning || isRunningAll}
              title="Bu testi çalıştır"
              className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-300 dark:hover:bg-emerald-900 border border-emerald-200 dark:border-emerald-800 transition-colors disabled:opacity-50"
            >
              {isRunning ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3 fill-current" />}
              <span>{isRunning ? "Koşuluyor" : "Çalıştır"}</span>
            </button>
          </div>
        </div>

        {/* Title and Prompt */}
        <h3 className="font-semibold text-sm text-foreground">{testCase.name}</h3>
        <div className="mt-2 text-xs bg-muted/50 rounded-lg p-2.5 text-muted-foreground font-mono border">
          <span className="text-foreground font-semibold">İstek: </span>
          &ldquo;{testCase.prompt}&rdquo;
        </div>
      </div>

      {/* Expand / Details Toggle Bar */}
      <div className="mt-3 pt-2.5 border-t text-[11px] text-muted-foreground flex flex-col gap-2">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-3">
            {caseResult ? (
              <>
                <span>Skor: <strong>{caseResult.acceptableScore === 1 ? "1.0" : "0.0"}</strong></span>
                <span>Süre: <strong>{caseResult.durationMs}ms</strong></span>
              </>
            ) : (
              <span className="text-muted-foreground/80 italic">Henüz koşulmadı</span>
            )}
          </div>

          <button
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
            className="flex items-center gap-1 text-primary hover:underline font-semibold"
          >
            <Info className="h-3 w-3" />
            {expanded ? "Detayları Gizle" : "Senaryo Detayı & Fark"}
            {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
        </div>

        {/* Expanded Scenario Details & Specifications */}
        {expanded && (
          <div
            onClick={(e) => e.stopPropagation()}
            className="mt-2 p-3 bg-muted/40 rounded-lg border font-mono text-[10px] space-y-3"
          >
            {/* Scenario Specification Metadata */}
            <div className="space-y-1.5 border-b pb-2.5">
              <div className="text-[10px] font-bold text-foreground uppercase tracking-wider flex items-center gap-1">
                <Info className="h-3 w-3 text-primary" /> Senaryo Özellikleri & Kontrat:
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-muted-foreground">
                <div className="flex items-center gap-1">
                  <Compass className="h-3 w-3 text-primary" />
                  <span>Alan: <strong className="text-foreground">{context.workspace}</strong></span>
                </div>
                <div className="flex items-center gap-1">
                  <Layers className="h-3 w-3 text-primary" />
                  <span>Rota: <code className="text-foreground">{context.route}</code></span>
                </div>
              </div>

              {/* Target / Expected Action */}
              {testCase.expectedAction && (
                <div className="p-2 rounded bg-blue-500/10 border border-blue-500/20 text-blue-700 dark:text-blue-300">
                  <div className="font-bold">⚡ Beklenen Eylem:</div>
                  <div className="mt-0.5">
                    {testCase.expectedAction.componentId} ➔ <strong>{testCase.expectedAction.action}</strong>
                  </div>
                </div>
              )}

              {/* Forbidden Actions */}
              {testCase.forbiddenActions && testCase.forbiddenActions.length > 0 && (
                <div className="p-2 rounded bg-rose-500/10 border border-rose-500/20 text-rose-700 dark:text-rose-300">
                  <div className="font-bold">🚫 Yasaklı Güvenlik Bariyeri:</div>
                  <div className="mt-0.5">
                    {testCase.forbiddenActions.map((f, i) => (
                      <span key={i} className="inline-block mr-2">
                        {f.componentId} ➔ <strong>{f.action}</strong>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Policy Rules */}
              {context.guardrails.length > 0 && (
                <div className="space-y-1 pt-1">
                  <div className="font-bold text-foreground flex items-center gap-1">
                    <Shield className="h-3 w-3 text-amber-500" /> Uygulanan İş Kuralları:
                  </div>
                  <ul className="list-disc pl-4 space-y-0.5 text-muted-foreground">
                    {context.guardrails.map((g, i) => (
                      <li key={i}>{g}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Run Result & Diff (if test has been executed) */}
            {caseResult?.diagnostics ? (
              <div className="space-y-2 pt-1">
                <div className="font-bold text-foreground uppercase tracking-wider">
                  Test Koşum Analizi & Fark (Diff):
                </div>
                <EvalDiffInspector
                  testCase={testCase}
                  actualActions={caseResult.diagnostics.dispatchedActions}
                  responseMessage={caseResult.diagnostics.responseMessage}
                />
              </div>
            ) : (
              <div className="text-muted-foreground text-center py-2 italic">
                Bu senaryo henüz koşturulmadı. &quot;Çalıştır&quot; butonuna basarak modelin çıktısını test edebilirsiniz.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
