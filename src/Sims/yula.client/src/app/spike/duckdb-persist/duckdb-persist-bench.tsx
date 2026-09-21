"use client";

import * as React from "react"
import * as duckdb from "@duckdb/duckdb-wasm"
import {
  RecordBatchReader,
  Table,
  tableToIPC,
  type RecordBatch,
} from "apache-arrow"
import { getCompanyHeaders } from "@/lib/company-headers"
import { formatCount } from "@/utils/format"
import {
  MANUAL_BUNDLES,
  DB_FILE,
  TABLE,
  CHUNK_ROWS,
  type Mode,
  type SourceKind,
  type Probe,
  type LogLine,
  type BenchState,
  INITIAL_STATE,
  isOomMessage,
  syntheticTable,
  opfsFileEntries,
  opfsDbFileSize,
} from "./duckdb-persist-types"
import {
  BenchFormControls,
  BenchActionButtons,
  BenchStatsCards,
  BenchOpfsFileList,
  BenchLogsAndProbes,
} from "./duckdb-persist-views"

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
    const bootstrap = async () => {
      await refreshOpfs()
      if (navigator.storage?.estimate) {
        const estimate = await navigator.storage.estimate()
        setStorageBefore(estimate.usage ?? null)
      }
    }
    void bootstrap()
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
    const legacy = [
      DB_FILE,
      "sims_reports.duckdb",
      "sims_reports.duckdb.wal",
    ]
    for (const name of legacy) {
      try {
        const root = await navigator.storage.getDirectory()
        await root.removeEntry(name)
        log("info", `[reset] ${name} silindi`)
      } catch {
        log("warn", `[reset] ${name} bulunamadı`)
      }
    }
    void refreshOpfs()
  }, [log, refreshOpfs, teardown])

  const cleanCacheExt = React.useCallback(
    async (ext: ".arrow" | ".parquet") => {
      let removed = 0
      try {
        const root = await navigator.storage.getDirectory()
        const dir = await root.getDirectoryHandle("sims_arrow_reports", {
          create: true,
        })
        const names: string[] = []
        for await (const [name, handle] of dir.entries()) {
          if (handle.kind === "file" && name.endsWith(ext)) names.push(name)
        }
        for (const name of names) {
          await dir.removeEntry(name).catch(() => {})
          removed += 1
        }
        log("info", `[cache] ${ext} → ${removed} dosya silindi`)
      } catch (err) {
        log("warn", `[cache] ${ext} temizlenemedi: ${(err as Error)?.message ?? ""}`)
      }
      void refreshOpfs()
    },
    [log, refreshOpfs]
  )

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

      <BenchFormControls
        mode={mode}
        setMode={setMode}
        source={source}
        setSource={setSource}
        memoryLimit={memoryLimit}
        setMemoryLimit={setMemoryLimit}
        rows={rows}
        setRows={setRows}
        strWidth={strWidth}
        setStrWidth={setStrWidth}
        url={url}
        setUrl={setUrl}
        checkpointEvery={checkpointEvery}
        setCheckpointEvery={setCheckpointEvery}
      />

      <BenchActionButtons
        running={state.running}
        canRun={!(source === "url" && !url.trim())}
        onRunBench={() => void runBench()}
        onRunPersistCheck={() => void runPersistCheck()}
        onCleanCacheExt={(ext) => void cleanCacheExt(ext)}
        onResetOpfs={() => void resetOpfs()}
      />

      <BenchStatsCards state={state} storageDelta={storageDelta} />
      <BenchOpfsFileList opfsFiles={opfsFiles} />
      <BenchLogsAndProbes persistCheck={persistCheck} logs={logs} probes={probes} />
    </div>
  )
}
