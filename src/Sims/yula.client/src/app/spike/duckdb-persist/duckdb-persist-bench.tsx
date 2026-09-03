"use client";

import * as React from "react"
import * as duckdb from "@duckdb/duckdb-wasm"
import {
  RecordBatchReader,
  Table,
  tableFromArrays,
  tableToIPC,
  type RecordBatch,
} from "apache-arrow"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { getCompanyHeaders } from "@/lib/company-headers"
import { formatCount } from "@/utils/format"

const MANUAL_BUNDLES: duckdb.DuckDBBundles = {
  mvp: {
    mainModule: "/duckdb/duckdb-mvp.wasm",
    mainWorker: "/duckdb/duckdb-browser-mvp.worker.js",
  },
  eh: {
    mainModule: "/duckdb/duckdb-eh.wasm",
    mainWorker: "/duckdb/duckdb-browser-eh.worker.js",
  },
}

const DB_FILE = "bench_reports.duckdb"
const TABLE = "bench_table"
const CHUNK_ROWS = 50_000

type Mode = "memory" | "opfs-auto" | "opfs-manual"
type SourceKind = "synthetic" | "url"

type Probe = {
  batch: number
  rows: number
  elapsedMs: number
  duckdbBytes: number | null
  tempBytes: number | null
  heapBytes: number | null
  checkpointMs: number | null
}

type LogLine = { kind: "info" | "warn" | "error"; msg: string }

type BenchState = {
  running: boolean
  batches: number
  rows: number
  elapsedMs: number
  duckdbBytes: number | null
  tempBytes: number | null
  peakHeap: number | null
  status: "idle" | "running" | "done" | "partial" | "error"
  statusMsg: string
}

const INITIAL_STATE: BenchState = {
  running: false,
  batches: 0,
  rows: 0,
  elapsedMs: 0,
  duckdbBytes: null,
  tempBytes: null,
  peakHeap: null,
  status: "idle",
  statusMsg: "",
}

function isOomMessage(msg: string): boolean {
  return (
    msg.includes("Out of Memory") ||
    msg.includes("could not allocate block") ||
    msg.includes("Allocation failure")
  )
}

function syntheticTable(rows: number, seed: number, strWidth: number): Table {
  const ids = new Int32Array(rows)
  const vals = new Float64Array(rows)
  const names: string[] = new Array(rows)
  const cats: string[] = new Array(rows)
  const pad = "x".repeat(Math.max(0, strWidth - 14))
  for (let i = 0; i < rows; i++) {
    ids[i] = (seed * 1_000_003 + i) | 0
    vals[i] = Math.sin(i + seed) * 1000
    names[i] = `name_${seed}_${i}_${pad}`
    cats[i] = `cat_${(i + seed) % 7}`
  }
  return tableFromArrays({ id: ids, val: vals, name: names, cat: cats })
}

async function opfsFileEntries(): Promise<{ name: string; size: number }[]> {
  if (typeof navigator === "undefined" || !navigator.storage?.getDirectory) return []
  const root = await navigator.storage.getDirectory()
  const out: { name: string; size: number }[] = []
  for await (const [name, handle] of root.entries()) {
    if (handle.kind === "file") {
      const file = await handle.getFile()
      out.push({ name, size: file.size })
    } else {
      for await (const [childName, child] of handle.entries()) {
        if (child.kind === "file") {
          const file = await child.getFile()
          out.push({ name: `${name}/${childName}`, size: file.size })
        }
      }
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

async function opfsDbFileSize(): Promise<number | null> {
  try {
    const root = await navigator.storage.getDirectory()
    const fh = await root.getFileHandle(DB_FILE, { create: false })
    return (await fh.getFile()).size
  } catch {
    return null
  }
}

export function DuckDbPersistBench() {
  const [mode, setMode] = React.useState<Mode>("opfs-manual")
  const [source, setSource] = React.useState<SourceKind>("synthetic")
  const [rows, setRows] = React.useState(10_000_000)
  const [strWidth, setStrWidth] = React.useState(48)
  const [url, setUrl] = React.useState("")
  const [memoryLimit, setMemoryLimit] = React.useState("3GB")
  const [checkpointEvery, setCheckpointEvery] = React.useState(1)

  const [state, setState] = React.useState<BenchState>(INITIAL_STATE)
  const [probes, setProbes] = React.useState<Probe[]>([])
  const [logs, setLogs] = React.useState<LogLine[]>([])
  const [storageBefore, setStorageBefore] = React.useState<number | null>(null)
  const [storageAfter, setStorageAfter] = React.useState<number | null>(null)
  const [opfsFiles, setOpfsFiles] = React.useState<{ name: string; size: number }[]>([])
  const [persistCheck, setPersistCheck] = React.useState<string>("")

  const dbRef = React.useRef<duckdb.AsyncDuckDB | null>(null)
  const connRef = React.useRef<duckdb.AsyncDuckDBConnection | null>(null)
  const runningRef = React.useRef(false)

  const log = React.useCallback((kind: LogLine["kind"], msg: string) => {
    setLogs((prev) => [{ kind, msg }, ...prev].slice(0, 250))
  }, [])

  const refreshOpfs = React.useCallback(async () => {
    try {
      setOpfsFiles(await opfsFileEntries())
    } catch {
      setOpfsFiles([])
    }
  }, [])

  React.useEffect(() => {
    void refreshOpfs()
    if (navigator.storage?.estimate) {
      void navigator.storage.estimate().then((e) => setStorageBefore(e.usage ?? null))
    }
  }, [refreshOpfs])

  const teardown = React.useCallback(async () => {
    try {
      await connRef.current?.close()
    } catch {
      /* yoksay */
    }
    try {
      await dbRef.current?.terminate()
    } catch {
      /* yoksay */
    }
    connRef.current = null
    dbRef.current = null
  }, [])

  const openBench = React.useCallback(
    async (selected: Mode, limit: string) => {
      const bundle = await duckdb.selectBundle(MANUAL_BUNDLES)
      const worker = new Worker(bundle.mainWorker!)
      const db = new duckdb.AsyncDuckDB(new duckdb.VoidLogger(), worker)
      await db.instantiate(bundle.mainModule, bundle.pthreadWorker)

      const path = `opfs://${DB_FILE}`
      if (selected === "opfs-manual") {
        // Boş dosya guard'ını aş: FileSystemFileHandle'ı biz register ederiz;
        // handle iç worker'da createSyncAccessHandle'e dönüştürülür (main thread
        // sync access handle oluşturamaz).
        const root = await navigator.storage.getDirectory()
        const fh = await root.getFileHandle(DB_FILE, { create: true })
        await db.registerFileHandle(
          path,
          fh,
          duckdb.DuckDBDataProtocol.BROWSER_FSACCESS,
          true
        )
      }
      await db.open({
        path: selected === "memory" ? undefined : path,
        accessMode: duckdb.DuckDBAccessMode.READ_WRITE,
      })

      const conn = await db.connect()
      await conn.query("SET preserve_insertion_order=false;").catch(() => {})
      await conn.query(`SET memory_limit='${limit}';`).catch(() => {})

      dbRef.current = db
      connRef.current = conn
      return conn
    },
    []
  )

  const runBench = React.useCallback(async () => {
    if (runningRef.current) return
    runningRef.current = true
    setState({ ...INITIAL_STATE, running: true, status: "running" })
    setProbes([])
    setLogs([])
    setPersistCheck("")
    setStorageAfter(null)

    let storageStart: number | null = null
    if (navigator.storage?.estimate) {
      const est = await navigator.storage.estimate()
      storageStart = est.usage ?? null
      setStorageBefore(storageStart)
    }

    const started = performance.now()
    let peakHeap: number | null = null
    let batches = 0
    let totalRows = 0
    let memoryProbeBroken = false

    try {
      const conn = await openBench(mode, memoryLimit)
      log("info", `[open] mode=${mode} memory_limit=${memoryLimit}`)

      await conn.query(`DROP TABLE IF EXISTS "${TABLE}"`).catch(() => {})

      const probe = async (checkpointMs: number | null) => {
        batches += 1
        const heap =
          typeof performance !== "undefined" &&
          (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory
            ? (performance as unknown as { memory: { usedJSHeapSize: number } }).memory
                .usedJSHeapSize
            : null
        if (heap != null) peakHeap = Math.max(peakHeap ?? 0, heap)

        let duckdbBytes: number | null = null
        let tempBytes: number | null = null
        if (!memoryProbeBroken) {
          try {
            const res = await conn.query(
              "SELECT sum(memory_usage_bytes)::BIGINT AS mem, sum(temporary_storage_bytes)::BIGINT AS tmp FROM duckdb_memory()"
            )
            const rowsJson = res.toArray().map((r) => r.toJSON())
            duckdbBytes = Number(rowsJson[0]?.mem ?? 0)
            tempBytes = Number(rowsJson[0]?.tmp ?? 0)
          } catch {
            memoryProbeBroken = true
          }
        }

        const sample: Probe = {
          batch: batches,
          rows: totalRows,
          elapsedMs: Math.round(performance.now() - started),
          duckdbBytes,
          tempBytes,
          heapBytes: heap,
          checkpointMs,
        }
        setProbes((prev) => [...prev, sample])
        setState((prev) => ({
          ...prev,
          batches,
          rows: totalRows,
          elapsedMs: sample.elapsedMs,
          duckdbBytes,
          tempBytes,
          peakHeap,
        }))
      }

      if (source === "synthetic") {
        const batchCount = Math.ceil(rows / CHUNK_ROWS)
        for (let b = 0; b < batchCount; b++) {
          const batchRows = Math.min(CHUNK_ROWS, rows - b * CHUNK_ROWS)
          const table = syntheticTable(batchRows, b, strWidth)
          const bytes = tableToIPC(table, "stream")
          await conn.insertArrowFromIPCStream(bytes, {
            name: TABLE,
            create: b === 0,
          })
          totalRows += batchRows

          let checkpointMs: number | null = null
          if (checkpointEvery > 0 && (b + 1) % checkpointEvery === 0) {
            const t0 = performance.now()
            await conn.query("CHECKPOINT;").catch(() => {})
            checkpointMs = Math.round(performance.now() - t0)
          }
          await probe(checkpointMs)
        }
      } else {
        const res = await fetch(url, {
          headers: {
            Accept: "application/vnd.apache.arrow.stream, application/octet-stream",
            ...getCompanyHeaders(),
          },
        })
        if (!res.ok || !res.body) throw new Error(`Stream hatası (${res.status})`)
        const reader = await RecordBatchReader.from(res.body)
        let group: RecordBatch[] = []
        let groupRows = 0
        let isFirst = true
        for await (const batch of reader) {
          group.push(batch)
          groupRows += batch.numRows
          if (groupRows >= CHUNK_ROWS) {
            const bytes = tableToIPC(new Table(group), "stream")
            await conn.insertArrowFromIPCStream(bytes, {
              name: TABLE,
              create: isFirst,
            })
            totalRows += groupRows
            group = []
            groupRows = 0
            isFirst = false

            let checkpointMs: number | null = null
            if (checkpointEvery > 0 && batches + 1 >= checkpointEvery && (batches + 1) % checkpointEvery === 0) {
              const t0 = performance.now()
              await conn.query("CHECKPOINT;").catch(() => {})
              checkpointMs = Math.round(performance.now() - t0)
            }
            await probe(checkpointMs)
          }
        }
        if (group.length > 0) {
          const bytes = tableToIPC(new Table(group), "stream")
          await conn.insertArrowFromIPCStream(bytes, {
            name: TABLE,
            create: isFirst,
          })
          totalRows += groupRows
          await probe(null)
        }
      }

      const elapsed = Math.round(performance.now() - started)
      if (navigator.storage?.estimate) {
        const est = await navigator.storage.estimate()
        setStorageAfter(est.usage ?? null)
      }
      void refreshOpfs()

      const dbSize = mode === "memory" ? null : await opfsDbFileSize()
      log(
        "info",
        mode === "memory"
          ? "[proof] memory modu — disk kanıtı gerekmez"
          : `[proof] bench_reports.duckdb = ${
              dbSize != null
                ? `${(dbSize / 1048576).toFixed(1)} MB OPFS diskte`
                : "OPFS'te bulunamadı (bellek-içi!) — hipotez ÇÜRÜK"
            }`
      )
      if (storageStart != null && navigator.storage?.estimate) {
        const est = await navigator.storage.estimate()
        const delta = (est.usage ?? 0) - storageStart
        log("info", `[proof] storage.estimate deltası = ${(delta / 1048576).toFixed(1)} MB`)
      }

      setState((prev) => ({
        ...prev,
        running: false,
        status: "done",
        statusMsg: `${formatCount(totalRows)} satır ${elapsed} ms içinde ingest edildi`,
        elapsedMs: elapsed,
        rows: totalRows,
        batches,
        peakHeap,
      }))
      log("info", `[done] ${formatCount(totalRows)} satır, ${elapsed} ms`)
    } catch (err) {
      const msg = (err as Error)?.message || String(err)
      const elapsed = Math.round(performance.now() - started)
      if (navigator.storage?.estimate) {
        const est = await navigator.storage.estimate()
        setStorageAfter(est.usage ?? null)
      }
      void refreshOpfs()

      const dbSize = mode === "memory" ? null : await opfsDbFileSize()
      log(
        "info",
        mode === "memory"
          ? "[proof] memory modu — disk kanıtı gerekmez"
          : `[proof] bench_reports.duckdb = ${
              dbSize != null
                ? `${(dbSize / 1048576).toFixed(1)} MB OPFS diskte`
                : "OPFS'te bulunamadı (bellek-içi!) — hipotez ÇÜRÜK"
            }`
      )

      const partial = totalRows > 0 && isOomMessage(msg)
      setState((prev) => ({
        ...prev,
        running: false,
        status: partial ? "partial" : "error",
        statusMsg: partial
          ? `Bellek tavanı: ${formatCount(totalRows)} satırda durdu — ${msg.slice(0, 160)}`
          : msg,
        elapsedMs: elapsed,
        rows: totalRows,
        batches,
        peakHeap,
      }))
      log(partial ? "warn" : "error", `[fail@${batches}] ${msg}`)
    } finally {
      runningRef.current = false
      await teardown()
    }
  }, [
    checkpointEvery,
    log,
    memoryLimit,
    mode,
    openBench,
    refreshOpfs,
    rows,
    source,
    strWidth,
    teardown,
    url,
  ])

  const runPersistCheck = React.useCallback(async () => {
    setPersistCheck("Kontrol ediliyor…")
    try {
      const conn = await openBench("opfs-auto", memoryLimit)
      const res = await conn.query(
        `SELECT table_name FROM information_schema.tables WHERE table_schema='main'`
      )
      const tables = res.toArray().map((r) => String(r.toJSON().table_name))
      if (!tables.includes(TABLE)) {
        setPersistCheck(`Kalıcilik YOK: "${TABLE}" bulunamadı. Tablolar: ${tables.join(", ") || "—"}`)
      } else {
        const cnt = await conn.query(`SELECT COUNT(*)::BIGINT AS c FROM "${TABLE}"`)
        const c = Number(cnt.toArray()[0]?.toJSON().c ?? 0)
        setPersistCheck(`Kalıcilik VAR: "${TABLE}" → ${formatCount(c)} satır`)
      }
      await teardown()
    } catch (err) {
      setPersistCheck(`Kontrol hatası: ${(err as Error)?.message || String(err)}`)
      await teardown()
    }
  }, [memoryLimit, openBench, teardown])

  const resetOpfs = React.useCallback(async () => {
    await teardown()
    try {
      const root = await navigator.storage.getDirectory()
      await root.removeEntry(DB_FILE)
      log("info", "[reset] bench_reports.duckdb silindi")
    } catch {
      log("warn", "[reset] bench_reports.duckdb bulunamadı")
    }
    void refreshOpfs()
  }, [log, refreshOpfs, teardown])

  const storageDelta =
    storageBefore != null && storageAfter != null ? storageAfter - storageBefore : null

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-4 text-xs">
      <div>
        <h1 className="text-sm font-semibold">DuckDB IPC → kalıcı db benchmark</h1>
        <p className="text-muted-foreground">
          In-memory / opfs-auto / opfs-manual modlarında batch&apos;li Arrow IPC
          ingest eder; duckdb_memory, heap, OPFS disk büyümesini ölçer.
          Chrome önerilir.
        </p>
      </div>

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
              placeholder="/api/arrow/jobs/&lt;name&gt;/&lt;jobId&gt;/result"
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

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          disabled={state.running || (source === "url" && !url.trim())}
          onClick={() => void runBench()}
        >
          {state.running ? "Çalışıyor…" : "Benchmark çalıştır"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={state.running}
          onClick={() => void runPersistCheck()}
        >
          Kalıcılık kontrolü (opfs-auto)
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={state.running}
          onClick={() => void resetOpfs()}
        >
          OPFS db dosyasını sil
        </Button>
      </div>

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
    </div>
  )
}
