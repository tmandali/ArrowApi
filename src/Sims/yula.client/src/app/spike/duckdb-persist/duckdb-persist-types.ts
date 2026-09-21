import * as duckdb from "@duckdb/duckdb-wasm"
import { Table, tableFromArrays } from "apache-arrow"

export const MANUAL_BUNDLES: duckdb.DuckDBBundles = {
  mvp: {
    mainModule: "/duckdb/duckdb-mvp.wasm",
    mainWorker: "/duckdb/duckdb-browser-mvp.worker.js",
  },
  eh: {
    mainModule: "/duckdb/duckdb-eh.wasm",
    mainWorker: "/duckdb/duckdb-browser-eh.worker.js",
  },
}

export const DB_FILE = "bench_reports.duckdb"
export const TABLE = "bench_table"
export const CHUNK_ROWS = 50_000

export type Mode = "memory" | "opfs-auto" | "opfs-manual"
export type SourceKind = "synthetic" | "url"

export type Probe = {
  batch: number
  rows: number
  elapsedMs: number
  duckdbBytes: number | null
  tempBytes: number | null
  heapBytes: number | null
  checkpointMs: number | null
}

export type LogLine = { kind: "info" | "warn" | "error"; msg: string }

export type BenchState = {
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

export const INITIAL_STATE: BenchState = {
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

export function isOomMessage(msg: string): boolean {
  return (
    msg.includes("Out of Memory") ||
    msg.includes("could not allocate block") ||
    msg.includes("Allocation failure")
  )
}

export function syntheticTable(rows: number, seed: number, strWidth: number): Table {
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

export async function opfsFileEntries(): Promise<{ name: string; size: number }[]> {
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

export async function opfsDbFileSize(): Promise<number | null> {
  try {
    const root = await navigator.storage.getDirectory()
    const fh = await root.getFileHandle(DB_FILE, { create: false })
    return (await fh.getFile()).size
  } catch {
    return null
  }
}
