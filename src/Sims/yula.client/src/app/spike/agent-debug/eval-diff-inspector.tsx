"use client";

import * as React from "react";
import type { EvalTestCase, DispatchedAction } from "@my-agent/core";
import { CheckCircle2, XCircle, AlertTriangle, ShieldCheck, ShieldAlert } from "lucide-react";

export interface EvalDiffInspectorProps {
  testCase: EvalTestCase;
  actualActions: DispatchedAction[];
  responseMessage?: string;
}

export function EvalDiffInspector({
  testCase,
  actualActions,
  responseMessage = "",
}: EvalDiffInspectorProps) {
  const isNegativeGuard = testCase.category === "negative_guard";
  const expected = testCase.expectedAction;
  const primaryActual = actualActions[0] as DispatchedAction | undefined;

  // 1. Negative Guardrail Check
  if (isNegativeGuard) {
    const forbidden = testCase.forbiddenActions || [];
    const violatedAction = forbidden.find((fb) =>
      actualActions.some((a) => a.componentId === fb.componentId && a.action === fb.action),
    );
    const hasViolation = Boolean(violatedAction);
    const hasValidDecision = testCase.expectedDecision ? testCase.expectedDecision(responseMessage) : true;

    return (
      <div className="space-y-3 font-mono text-[11px]">
        {/* Security Status Banner */}
        <div
          className={`p-2.5 rounded-lg border flex items-center justify-between ${
            hasViolation
              ? "bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-400"
              : "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
          }`}
        >
          <div className="flex items-center gap-2 font-semibold">
            {hasViolation ? <ShieldAlert className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
            <span>{hasViolation ? "GÜVENLİK DUVARI İHLAL EDİLDİ" : "GÜVENLİK DUVARI KORUNDU"}</span>
          </div>
          <span className="text-[10px] px-2 py-0.5 rounded bg-background/50 font-bold">
            {hasViolation ? "BAŞARISIZ" : "GEÇTİ"}
          </span>
        </div>

        {/* Forbidden Actions List */}
        <div className="p-2.5 rounded-lg border bg-muted/20 space-y-1.5">
          <div className="text-[10px] font-semibold text-muted-foreground uppercase">Yasaklı Eylemler (Forbidden):</div>
          {forbidden.map((fb, idx) => {
            const wasCalled = actualActions.some((a) => a.componentId === fb.componentId && a.action === fb.action);
            return (
              <div
                key={idx}
                className={`p-1.5 rounded flex items-center justify-between border ${
                  wasCalled
                    ? "bg-rose-100 dark:bg-rose-950 border-rose-300 text-rose-700 dark:text-rose-300 font-bold"
                    : "bg-background border-muted text-muted-foreground"
                }`}
              >
                <span>{fb.componentId} ➔ {fb.action}</span>
                <span>{wasCalled ? "❌ Tetiklendi (İhlal!)" : "🛡️ Engellendi"}</span>
              </div>
            );
          })}
        </div>

        {/* Decision Justification */}
        <div className="p-2.5 rounded-lg border bg-muted/20 space-y-1">
          <div className="flex items-center justify-between text-[10px] font-semibold">
            <span className="text-muted-foreground uppercase">Gerekçelendirme Metni (Decision O(r)):</span>
            <span className={hasValidDecision ? "text-emerald-600" : "text-amber-500"}>
              {hasValidDecision ? "✔ Politika Kuralı Bulundu" : "⚠ Kural Kelimeleri Bulunamadı"}
            </span>
          </div>
          <div className="p-2 rounded bg-background border text-muted-foreground text-[10px] leading-relaxed">
            {responseMessage || "Model herhangi bir açıklama metni üretmedi."}
          </div>
        </div>
      </div>
    );
  }

  // 2. Positive Action Diff Check
  const componentMatches = expected && primaryActual ? expected.componentId === primaryActual.componentId : false;
  const actionMatches = expected && primaryActual ? expected.action === primaryActual.action : false;
  const targetPassed = Boolean(componentMatches && actionMatches);

  const expPayload = (primaryActual?.payload ?? {}) as Record<string, unknown>;

  return (
    <div className="space-y-3 font-mono text-[11px]">
      {/* Target Action Match Header */}
      <div
        className={`p-2.5 rounded-lg border flex items-center justify-between ${
          targetPassed
            ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
            : "bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-400"
        }`}
      >
        <div className="flex items-center gap-2 font-semibold">
          {targetPassed ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
          <span>{targetPassed ? "HEDEF EYLEM DOĞRULANDI" : "HEDEF EYLEM UYUŞMADI"}</span>
        </div>
        <span className="text-[10px] px-2 py-0.5 rounded bg-background/50 font-bold">
          {targetPassed ? "C(r) = 1" : "C(r) = 0"}
        </span>
      </div>

      {/* Side-by-side Component & Action Diff */}
      <div className="grid grid-cols-2 gap-2 text-[10px]">
        {/* Expected */}
        <div className="p-2.5 rounded-lg border bg-blue-500/5 border-blue-500/20 space-y-1">
          <div className="font-semibold text-blue-600 dark:text-blue-400 uppercase">Beklenen (Expected):</div>
          <div className="text-foreground">
            Bileşen: <strong>{expected?.componentId ?? "Yok"}</strong>
          </div>
          <div className="text-foreground">
            Aksiyon: <strong>{expected?.action ?? "Yok"}</strong>
          </div>
        </div>

        {/* Actual */}
        <div
          className={`p-2.5 rounded-lg border space-y-1 ${
            targetPassed
              ? "bg-emerald-500/5 border-emerald-500/20"
              : "bg-rose-500/5 border-rose-500/20 text-rose-600 dark:text-rose-400"
          }`}
        >
          <div className="font-semibold uppercase text-muted-foreground">Üretilen (Actual):</div>
          <div className="text-foreground">
            Bileşen: <strong>{primaryActual?.componentId ?? "Çağrılmadı"}</strong>
          </div>
          <div className="text-foreground">
            Aksiyon: <strong>{primaryActual?.action ?? "Çağrılmadı"}</strong>
          </div>
        </div>
      </div>

      {/* Dispatched Payload Inspection */}
      {primaryActual && (
        <div className="p-2.5 rounded-lg border bg-muted/20 space-y-1.5">
          <div className="flex items-center justify-between text-[10px] font-semibold text-muted-foreground uppercase">
            <span>Model Tarafından Gönderilen Yük (Payload A(r)):</span>
            {actualActions.length > 1 && (
              <span className="text-amber-500 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" /> {actualActions.length} eylem tetiklendi
              </span>
            )}
          </div>
          <pre className="p-2 bg-background rounded border text-[10px] text-emerald-600 dark:text-emerald-400 overflow-x-auto">
            {JSON.stringify(expPayload, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
