import * as duckdb from "@duckdb/duckdb-wasm"

// Next karşılığı: ?url suffix yerine public/duckdb altındaki self-hosted dosyalar
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

let db: duckdb.AsyncDuckDB | null = null
let conn: duckdb.AsyncDuckDBConnection | null = null
let initPromise: Promise<void> | null = null
const tableRowCounts = new Map<string, number>()
const tableVfsFiles = new Map<string, string[]>()

async function getDuckDb(): Promise<{
  db: duckdb.AsyncDuckDB
  conn: duckdb.AsyncDuckDBConnection
}> {
  if (db && conn) return { db, conn }

  if (!initPromise) {
    initPromise = (async () => {
      const bundle = await duckdb.selectBundle(MANUAL_BUNDLES)
      const worker = new Worker(bundle.mainWorker!)
      const logger = new duckdb.VoidLogger()
      const newDb = new duckdb.AsyncDuckDB(logger, worker)
      await newDb.instantiate(bundle.mainModule, bundle.pthreadWorker)

      // Bilinçli olarak IN-MEMORY db: kalıcı db dosyası (opfs:// dahil) WAL +
      // checkpoint'i WASM heap'inde tutup "Allocation failure" FATAL'ı üretiyor.
      // Kalıcılığı W3C OPFS Parquet cache'i (sims_parquet_reports) sağlıyor.
      // opfs.fileHandling="auto" ile DuckDB-WASM opfs:/ URI'larını doğrudan çözer.
      await newDb.open({
        opfs: {
          fileHandling: "auto",
        },
      })

      const newConn = await newDb.connect()
      await newConn.query("SET preserve_insertion_order=false;").catch(() => {})
      // eh.wasm build'i 4 GiB WASM heap'i ile geliyor (maximum: 65536 page).
      // 3 GB (≈2.79 GiB) buffer pool + IPC chunk/parquet tamponları için ~1 GB
      // marj güvenli: malloc abortu (FATAL) yerine kontrollü OOM üretilir.
      await newConn.query("SET memory_limit='3GB';").catch(() => {})
      db = newDb
      conn = newConn
      console.log(
        "[DuckDB Worker] init v4 — in-memory db, memory_limit=3GB (WAL/checkpoint yok)"
      )
    })()
  }

  await initPromise
  return { db: db!, conn: conn! }
}

function normalizeArrowValue(val: unknown): unknown {
  if (val === null || val === undefined) return null

  // 1. Date / Timestamp nesneleri
  if (val instanceof Date) {
    return !isNaN(val.getTime()) ? val.toISOString().slice(0, 10) : ""
  }

  // 2. BigInt (JS Number'a çevir — Web Worker transfer & JSON serialize için)
  if (typeof val === "bigint") {
    const num = Number(val)
    return Number.isSafeInteger(num) ? num : val.toString()
  }

  // 3. Uint8Array / Buffer / Binary (Hex veya Base64 stringe çevir)
  if (val instanceof Uint8Array || (typeof Buffer !== "undefined" && Buffer.isBuffer?.(val))) {
    try {
      const u8 = val instanceof Uint8Array ? val : new Uint8Array(val as ArrayBuffer)
      if (u8.length === 16) {
        // Guid / UUID (16 byte)
        const hex = Array.from(u8, (b) => b.toString(16).padStart(2, "0")).join("")
        return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
      }
      return Array.from(u8, (b) => b.toString(16).padStart(2, "0")).join("")
    } catch {
      return ""
    }
  }

  // 4. Custom Arrow Struct / Object / Map / HugeInt (Int128)
  if (typeof val === "object" && val !== null) {
    if ("low" in (val as any) && "high" in (val as any)) {
      const low = BigInt((val as any).low >>> 0)
      const high = BigInt((val as any).high)
      const big = (high << 64n) + low
      const num = Number(big)
      return Number.isSafeInteger(num) ? num : big.toString()
    }
    if (typeof (val as any).toJSON === "function") {
      return (val as any).toJSON()
    }
    if (Array.isArray(val)) {
      return val.map(normalizeArrowValue)
    }
  }

  return val
}

function arrowTableToObjects(table: any): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = []
  const schema = table?.schema
  const numRows = table?.numRows ?? 0
  if (!schema || numRows === 0) return rows

  const fields: string[] = schema.fields.map((f: any) => f.name)
  const columns = fields.map((name, index) =>
    typeof table.getChildAt === "function"
      ? table.getChildAt(index)
      : table.getChild(name)
  )

  for (let i = 0; i < numRows; i++) {
    const row: Record<string, unknown> = {}
    for (let j = 0; j < fields.length; j++) {
      const val = columns[j]?.get(i)
      row[fields[j]] = normalizeArrowValue(val)
    }
    rows.push(row)
  }
  return rows
}

async function resetDuckDb(): Promise<{
  db: duckdb.AsyncDuckDB
  conn: duckdb.AsyncDuckDBConnection
}> {
  try {
    if (conn) await conn.close().catch(() => {})
    if (db) await db.terminate().catch(() => {})
  } catch {
    // Ignore termination errors
  }
  db = null
  conn = null
  initPromise = null
  return getDuckDb()
}

type CatalogObjectType = "TABLE" | "VIEW"

function escapeIdentLiteral(name: string): string {
  return name.replace(/'/g, "''")
}

async function getCatalogType(
  conn: duckdb.AsyncDuckDBConnection,
  tableName: string,
): Promise<CatalogObjectType | null> {
  const escaped = escapeIdentLiteral(tableName)
  try {
    const res = await conn.query(
      `SELECT table_type FROM information_schema.tables WHERE table_name = '${escaped}' LIMIT 1`,
    )
    const rows = arrowTableToObjects(res)
    if (rows.length === 0) return null
    const type = String(rows[0]?.table_type ?? "").toUpperCase()
    return type.includes("VIEW") ? "VIEW" : "TABLE"
  } catch {
    return null
  }
}

/**
 * DuckDB `DROP VIEW IF EXISTS` / `DROP TABLE IF EXISTS` yanlış türde nesnede
 * Catalog Error fırlatır ("Existing object is of type Table, trying to drop type View").
 * Türü information_schema'dan okuyup yalnız doğru DROP'u çalıştır.
 */
async function safeDropObject(
  conn: duckdb.AsyncDuckDBConnection,
  tableName: string,
): Promise<void> {
  const quoted = `"${tableName.replace(/"/g, '""')}"`
  const type = await getCatalogType(conn, tableName)
  if (type === "VIEW") {
    await conn.query(`DROP VIEW ${quoted}`).catch(() => {})
    return
  }
  if (type === "TABLE") {
    await conn.query(`DROP TABLE ${quoted}`).catch(() => {})
    return
  }
}

self.onmessage = async (e: MessageEvent) => {
  const { id, type, payload } = e.data

  try {
    if (type === "RESET_DATABASE") {
      await resetDuckDb()
      self.postMessage({ id, success: true })
      return
    }

    let { conn } = await getDuckDb()

    try {
      switch (type) {
        case "INGEST_ARROW_BATCH": {
          const { tableName, buffer, append, rowCount } = payload
          const uint8 =
            buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)

          if (!append) {
            await safeDropObject(conn, tableName)
            tableRowCounts.set(tableName, 0)
          }

          // Main thread zaten IPC stream olarak serileştirdi; yeniden parse/serialize yok.
          await conn.insertArrowFromIPCStream(uint8, {
            name: tableName,
            create: !append,
          })

          const insertedRows = Number(rowCount ?? 0)
          const prevCount = tableRowCounts.get(tableName) ?? 0
          const count = prevCount + insertedRows
          tableRowCounts.set(tableName, count)

          self.postMessage({ id, success: true, rowCount: count })
          break
        }

        case "REGISTER_PARQUET_PARTS_VIEW": {
          const { tableName, jobId, partFiles } = payload as {
            tableName: string
            jobId: string
            partFiles?: string[]
          }

          await safeDropObject(conn, tableName)
          const quoted = `"${tableName.replace(/"/g, '""')}"`

          // 1. OPFS dizinine eriş ve part dosyalarını belirle
          const root = await navigator.storage.getDirectory()
          const parquetRoot = await root.getDirectoryHandle("sims_parquet_reports", { create: true })
          const jobDir = await parquetRoot.getDirectoryHandle(jobId, { create: false })

          let filesToRegister = [...(partFiles ?? [])]
          if (filesToRegister.length === 0) {
            for await (const [name, handle] of (jobDir as any).entries()) {
              if (handle.kind === "file" && name.endsWith(".parquet")) {
                filesToRegister.push(name)
              }
            }
          }
          filesToRegister.sort((a, b) => a.localeCompare(b))

          if (filesToRegister.length === 0) {
            throw new Error(`OPFS içinde parquet parçası bulunamadı: ${jobId}`)
          }

          // 2. Önceki registered VFS dosyalarını temizle
          const prevVfsFiles = tableVfsFiles.get(tableName) ?? []
          for (const prev of prevVfsFiles) {
            await db!.dropFile(prev).catch(() => {})
          }

          // 3. Her bir parçanın FileSystemFileHandle'ını DuckDB VFS'e BROWSER_FSACCESS ile bağla
          const vfsNames: string[] = []
          for (const fileName of filesToRegister) {
            const fileHandle = await jobDir.getFileHandle(fileName, { create: false })
            const vfsName = `${jobId}_${fileName}`
            await db!.dropFile(vfsName).catch(() => {})
            await db!.registerFileHandle(
              vfsName,
              fileHandle,
              duckdb.DuckDBDataProtocol.BROWSER_FSACCESS,
              true
            )
            vfsNames.push(vfsName)
          }
          tableVfsFiles.set(tableName, vfsNames)

          // 4. DuckDB sanal dosya sistemi üzerindeki parçalardan VIEW oluştur
          const fileListSql = vfsNames.map((n) => `'${n}'`).join(", ")
          await conn.query(`CREATE OR REPLACE VIEW ${quoted} AS SELECT * FROM read_parquet([${fileListSql}]);`)

          // 5. Satır sayısını al ve kaydet
          const cntRes = await conn.query(`SELECT COUNT(*)::BIGINT as count FROM ${quoted};`)
          const cntRows = arrowTableToObjects(cntRes)
          const count = Number(cntRows[0]?.count ?? 0)
          tableRowCounts.set(tableName, count)

          self.postMessage({ id, success: true, rowCount: count })
          break
        }

        case "FLUSH_CHECKPOINT": {
          await conn.query("CHECKPOINT;").catch(() => {})
          self.postMessage({ id, success: true })
          break
        }

        case "QUERY_ROWS": {
          const { sql } = payload
          try {
            const result = await conn.query(sql)
            const rows = arrowTableToObjects(result)
            self.postMessage({ id, success: true, rows, totalRows: rows.length })
          } catch (queryErr) {
            const msg = String(queryErr)
            if (msg.includes("does not exist")) {
              self.postMessage({ id, success: true, rows: [], totalRows: 0 })
            } else {
              console.error("DuckDb Worker QUERY_ROWS hatası:", queryErr, "SQL:", sql)
              self.postMessage({ id, success: false, error: msg })
            }
          }
          break
        }

        case "QUERY_SCALAR": {
          const { sql } = payload
          try {
            const result = await conn.query(sql)
            const rows = arrowTableToObjects(result)
            self.postMessage({ id, success: true, result: rows[0] ?? {} })
          } catch (queryErr) {
            const msg = String(queryErr)
            if (msg.includes("does not exist")) {
              self.postMessage({ id, success: true, result: { count: 0 } })
            } else {
              console.error("DuckDb Worker QUERY_SCALAR hatası:", queryErr, "SQL:", sql)
              self.postMessage({ id, success: false, error: msg })
            }
          }
          break
        }

        case "DESCRIBE_TABLE": {
          const { tableName } = payload
          try {
            const infoRes = await conn.query(`DESCRIBE "${tableName}"`)
            const infoRows = arrowTableToObjects(infoRes)
            const columns = infoRows
              .map((r: any) => {
                const colName = String(r.column_name ?? r.name ?? "")
                const colType = String(r.column_type ?? r.type ?? "").toUpperCase()
                const isNumeric =
                  colType.includes("INT") ||
                  colType.includes("FLOAT") ||
                  colType.includes("DOUBLE") ||
                  colType.includes("DECIMAL") ||
                  colType.includes("NUMERIC") ||
                  colType.includes("REAL")
                return {
                  name: colName,
                  label: colName.replace(/([a-z])([A-Z])/g, "$1 $2"),
                  align: isNumeric ? ("right" as const) : ("left" as const),
                  isNumeric,
                  duckType: colType,
                }
              })
              .filter((c) => c.name.length > 0)
            self.postMessage({ id, success: true, columns })
          } catch {
            self.postMessage({ id, success: true, columns: [] })
          }
          break
        }

        case "CHECK_TABLE_EXISTS": {
          const { tableName } = payload as { tableName: string }

          const quoted = `"${tableName.replace(/"/g, '""')}"`

          try {
            const existing = await getCatalogType(conn, tableName)
            if (existing) {
              const res = await conn.query(`SELECT COUNT(*) as count FROM ${quoted}`)
              const countRows = arrowTableToObjects(res)
              const rowCount = Number(countRows[0]?.count ?? 0)
              if (rowCount > 0) {
                self.postMessage({ id, success: true, exists: true, rowCount })
                break
              }
            }
          } catch {
            // Tablo veya view henüz bellekte yok
          }

          self.postMessage({ id, success: true, exists: false, rowCount: 0 })
          break
        }

        case "DROP_TABLE": {
          const { tableName } = payload
          await safeDropObject(conn, tableName)
          await safeDropObject(conn, `${tableName}_raw`)
          const registered = tableVfsFiles.get(tableName)
          if (registered && db) {
            for (const f of registered) {
              await db.dropFile(f).catch(() => {})
            }
            tableVfsFiles.delete(tableName)
          }
          tableRowCounts.delete(tableName)
          self.postMessage({ id, success: true })
          break
        }

        default:
          throw new Error(`Bilinmeyen mesaj tipi: ${type}`)
      }
    } catch (innerErr) {
      const msg = innerErr instanceof Error ? innerErr.message : String(innerErr)
      if (
        msg.includes("invalidated") ||
        msg.includes("Out of Memory") ||
        msg.includes("Allocation failure")
      ) {
        // Fatal bellek hatasında DuckDB'yi sıfırla ki sonraki sorgular kilitlenmesin
        await resetDuckDb().catch(() => {})
      }
      throw innerErr
    }
  } catch (err) {
    self.postMessage({
      id,
      success: false,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}
