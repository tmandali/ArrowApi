"useclient"

import React, { useEffect, useRef } from "react"
import { useSkillExecution } from "../hooks/use-skill-execution"
import { Terminal, X, StopCircle, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react"

interface SkillTerminalDrawerProps {
  executionId: string | null
  onClose: () => void
}

export function SkillTerminalDrawer({
  executionId,
  onClose,
}: SkillTerminalDrawerProps) {
  const { snapshot, logs, status, isRunning, abort } =
    useSkillExecution(executionId)
  const logContainerRef = useRef<HTMLDivElement>(null)

  // Auto-scroll logs to bottom as they stream in
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight
    }
  }, [logs])

  if (!executionId && !snapshot) {
    return null
  }

  const getStatusBadge = () => {
    switch (status) {
      case "running":
      case "queued":
      case "initializing":
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-500 border border-amber-500/20">
            <Loader2 className="w-3 h-3 animate-spin" />
            Çalışıyor
          </span>
        )
      case "completed":
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
            <CheckCircle2 className="w-3 h-3" />
            Tamamlandı
          </span>
        )
      case "failed":
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-rose-500/10 text-rose-500 border border-rose-500/20">
            <AlertTriangle className="w-3 h-3" />
            Hata
          </span>
        )
      case "cancelled":
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground border border-border">
            <StopCircle className="w-3 h-3" />
            İptal Edildi
          </span>
        )
      default:
        return null
    }
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 w-[540px] max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-card shadow-2xl overflow-hidden flex flex-col transition-all">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/40">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-primary" />
          <span className="font-semibold text-sm">
            {snapshot?.skillName || "Pyodide Beceri Yürütücü"}
          </span>
          {getStatusBadge()}
        </div>

        <div className="flex items-center gap-1.5">
          {isRunning && (
            <button
              onClick={abort}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-destructive hover:bg-destructive/10 rounded-md transition-colors"
              title="Yürütmeyi Durdur"
            >
              <StopCircle className="w-3.5 h-3.5" />
              Durdur
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1 hover:bg-muted text-muted-foreground hover:text-foreground rounded-md transition-colors"
            title="Kapat"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Terminal Logs Area */}
      <div
        ref={logContainerRef}
        className="h-64 overflow-y-auto p-3 font-mono text-xs bg-black/90 text-emerald-400 space-y-1 select-text"
      >
        <div className="text-zinc-500">
          [Sistem] Pyodide Web Worker izole oturumu başlatıldı...
        </div>
        {logs.length === 0 && isRunning && (
          <div className="text-zinc-500 animate-pulse">
            Python yorumlayıcısı hazırlanıyor (pandas/openpyxl)...
          </div>
        )}
        {logs.map((line, idx) => (
          <div
            key={idx}
            className={
              line.startsWith("[Error]") || line.startsWith("[stderr]")
                ? "text-rose-400"
                : line.startsWith("[SkillEventHub]")
                ? "text-amber-400"
                : "text-emerald-300"
            }
          >
            {line}
          </div>
        ))}
        {snapshot?.result !== undefined && snapshot?.result !== null && (
          <div className="mt-2 pt-2 border-t border-zinc-800 text-cyan-300">
            <span className="text-zinc-400 font-semibold">[Sonuç]: </span>
            {typeof snapshot.result === "object"
              ? JSON.stringify(snapshot.result, null, 2)
              : String(snapshot.result)}
          </div>
        )}
      </div>

      {/* Footer Info */}
      <div className="px-4 py-2 bg-muted/20 border-t border-border flex items-center justify-between text-[11px] text-muted-foreground">
        <span>WebAssembly (WASM) Sandbox</span>
        {snapshot?.durationMs ? (
          <span>Süre: {(snapshot.durationMs / 1000).toFixed(2)} sn</span>
        ) : (
          <span>İzole Thread</span>
        )}
      </div>
    </div>
  )
}
