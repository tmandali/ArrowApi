import * as React from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { formatCount } from "@/utils/format"
import type { BenchState, LogLine, Mode, Probe, SourceKind } from "./duckdb-persist-types"

export function BenchFormControls({
  mode,
  setMode,
  source,
  setSource,
  memoryLimit,
  setMemoryLimit,
  rows,
  setRows,
  strWidth,
  setStrWidth,
  url,
  setUrl,
  checkpointEvery,
  setCheckpointEvery,
}: {
  mode: Mode
  setMode: (m: Mode) => void
  source: SourceKind
  setSource: (s: SourceKind) => void
  memoryLimit: string
  setMemoryLimit: (l: string) => void
  rows: number
  setRows: (r: number) => void
  strWidth: number
  setStrWidth: (w: number) => void
  url: string
  setUrl: (u: string) => void
  checkpointEvery: number
  setCheckpointEvery: (c: number) => void
}) {
  return (
    <div className="grid grid-cols-2 gap-2 rounded-md border p-3 md:grid-cols-3">
      <label className="flex flex-col gap-1">
        <span className="text-muted-foreground">Mod</span>
        <select
          className="h-8 rounded-md border bg-background px-2"
          value={mode}
          onChange={(e) => setMode(e.target.value as Mode)}
        >
          <option value="memory">memory (in-memory db)</option>
          <option value="opfs-auto">opfs-auto (dispatcher path)</option>
          <option value="opfs-manual">opfs-manual (handle pre-register)</option>
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-muted-foreground">Kaynak</span>
        <select
          className="h-8 rounded-md border bg-background px-2"
          value={source}
          onChange={(e) => setSource(e.target.value as SourceKind)}
        >
          <option value="synthetic">Sentetik üretim</option>
          <option value="url">Gerçek job URL (Arrow stream)</option>
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-muted-foreground">memory_limit</span>
        <Input
          className="h-8"
          value={memoryLimit}
          onChange={(e) => setMemoryLimit(e.target.value)}
        />
      </label>
      {source === "synthetic" ? (
        <>
          <label className="flex flex-col gap-1">
            <span className="text-muted-foreground">Satır</span>
            <Input
              className="h-8"
              type="number"
              value={rows}
              onChange={(e) => setRows(Number(e.target.value) || 0)}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-muted-foreground">String genişliği (byte)</span>
            <Input
              className="h-8"
              type="number"
              value={strWidth}
              onChange={(e) => setStrWidth(Number(e.target.value) || 0)}
            />
          </label>
        </>
      ) : (
        <label className="col-span-2 flex flex-col gap-1">
          <span className="text-muted-foreground">Arrow stream URL</span>
          <Input
            className="h-8"
            value={url}
            placeholder="/api/arrow/jobs/<name>/<jobId>/result"
            onChange={(e) => setUrl(e.target.value)}
          />
        </label>
      )}
      <label className="flex flex-col gap-1">
        <span className="text-muted-foreground">CHECKPOINT (batch aralığı, 0=kapalı)</span>
        <Input
          className="h-8"
          type="number"
          value={checkpointEvery}
          onChange={(e) => setCheckpointEvery(Number(e.target.value) || 0)}
        />
      </label>
    </div>
  )
}

export function BenchActionButtons({
  running,
  canRun,
  onRunBench,
  onRunPersistCheck,
  onCleanCacheExt,
  onResetOpfs,
}: {
  running: boolean
  canRun: boolean
  onRunBench: () => void
  onRunPersistCheck: () => void
  onCleanCacheExt: (ext: ".arrow" | ".parquet") => void
  onResetOpfs: () => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        size="sm"
        disabled={running || !canRun}
        onClick={onRunBench}
      >
        {running ? "Çalışıyor…" : "Benchmark çalıştır"}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={running}
        onClick={onRunPersistCheck}
      >
        Kalıcılık kontrolü (opfs-auto)
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={running}
        onClick={() => onCleanCacheExt(".arrow")}
      >
        Arrow cache temizle
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={running}
        onClick={() => onCleanCacheExt(".parquet")}
      >
        Parquet cache temizle
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={running}
        onClick={onResetOpfs}
      >
        OPFS bench db + kalıntıları sil
      </Button>
    </div>
  )
}

export function BenchStatsCards({
  state,
  storageDelta,
}: {
  state: BenchState
  storageDelta: number | null
}) {
  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
      <div className="rounded-md border p-2">
        <div className="text-muted-foreground">Durum</div>
        <div className="font-semibold">{state.status}</div>
        <div className="truncate text-[11px] text-muted-foreground" title={state.statusMsg}>
          {state.statusMsg || "—"}
        </div>
      </div>
      <div className="rounded-md border p-2">
        <div className="text-muted-foreground">Satır / batch</div>
        <div className="font-semibold tabular-nums">
          {formatCount(state.rows)} / {state.batches}
        </div>
        <div className="text-[11px] text-muted-foreground tabular-nums">
          {(state.elapsedMs / 1000).toFixed(1)} s
        </div>
      </div>
      <div className="rounded-md border p-2">
        <div className="text-muted-foreground">duckdb_memory</div>
        <div className="font-semibold tabular-nums">
          {state.duckdbBytes != null ? `${(state.duckdbBytes / 1048576).toFixed(0)} MB` : "—"}
        </div>
        <div className="text-[11px] text-muted-foreground tabular-nums">
          temp: {state.tempBytes != null ? `${(state.tempBytes / 1048576).toFixed(0)} MB` : "—"}
        </div>
      </div>
      <div className="rounded-md border p-2">
        <div className="text-muted-foreground">Heap peak / OPFS delta</div>
        <div className="font-semibold tabular-nums">
          {state.peakHeap != null ? `${(state.peakHeap / 1048576).toFixed(0)} MB` : "—"}
        </div>
        <div className="text-[11px] text-muted-foreground tabular-nums">
          {storageDelta != null ? `${(storageDelta / 1048576).toFixed(0)} MB disk` : "disk ölçümü yok"}
        </div>
      </div>
    </div>
  )
}

export function BenchOpfsFileList({
  opfsFiles,
}: {
  opfsFiles: { name: string; size: number }[]
}) {
  return (
    <div className="rounded-md border p-2">
      <div className="mb-1 text-muted-foreground">OPFS dosyaları</div>
      {opfsFiles.length === 0 ? (
        <div className="text-[11px] text-muted-foreground">—</div>
      ) : (
        <div className="flex flex-col gap-0.5 tabular-nums">
          {opfsFiles.map((f) => (
            <div key={f.name} className="flex justify-between gap-2">
              <span className="truncate">{f.name}</span>
              <span className="shrink-0 text-muted-foreground">
                {(f.size / 1048576).toFixed(1)} MB
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function BenchLogsAndProbes({
  persistCheck,
  logs,
  probes,
}: {
  persistCheck: string
  logs: LogLine[]
  probes: Probe[]
}) {
  return (
    <>
      {persistCheck ? (
        <div className="rounded-md border p-2 font-medium">{persistCheck}</div>
      ) : null}

      <div className="rounded-md border p-2">
        <div className="mb-1 text-muted-foreground">Log</div>
        <pre className="max-h-56 overflow-auto whitespace-pre-wrap text-[11px] leading-4">
          {logs.length === 0
            ? "—"
            : logs
                .map((l) => `[${l.kind}] ${l.msg}`)
                .join("\n")}
        </pre>
      </div>

      <div className="rounded-md border p-2">
        <div className="mb-1 text-muted-foreground">
          duckdb_memory / heap örnekleri (batch bazlı)
        </div>
        <pre className="max-h-64 overflow-auto text-[11px] leading-4 tabular-nums">
          {probes.length === 0
            ? "—"
            : probes
                .map(
                  (p) =>
                    `b=${String(p.batch).padStart(4)} rows=${String(p.rows).padStart(9)} mem=${
                      p.duckdbBytes != null ? (p.duckdbBytes / 1048576).toFixed(0) + "MB" : "  -"
                    } tmp=${
                      p.tempBytes != null ? (p.tempBytes / 1048576).toFixed(0) + "MB" : "  -"
                    } heap=${
                      p.heapBytes != null ? (p.heapBytes / 1048576).toFixed(0) + "MB" : "  -"
                    } cp=${p.checkpointMs != null ? p.checkpointMs + "ms" : "-"}`
                )
                .join("\n")}
        </pre>
      </div>
    </>
  )
}
