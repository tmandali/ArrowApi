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

      // OPFS (Origin Private File System) ile yerel SSD kalıcı depolama
      try {
        await newDb.open({
          path: "sims_reports.duckdb",
          accessMode: duckdb.DuckDBAccessMode.READ_WRITE,
          opfs: { fileHandling: "auto" },
        })
      } catch (opfsErr) {
        console.warn("DuckDB OPFS kullanılamadı, in-memory moduna geçiliyor:", opfsErr)
        await newDb.open({}).catch(() => {})
      }

      const newConn = await newDb.connect()
      await newConn.query("SET preserve_insertion_order=false;").catch(() => {})
      db = newDb
      conn = newConn
    })()
  }

  await initPromise
  return { db: db!, conn: conn! }
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
      row[fields[j]] = typeof val === "bigint" ? Number(val) : val
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
            await conn.query(`DROP VIEW IF EXISTS "${tableName}"`).catch(() => {})
            await conn.query(`DROP TABLE IF EXISTS "${tableName}"`).catch(() => {})
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

        case "FINALIZE_PARQUET_VIEW": {
          const { tableName, jobId } = payload as { tableName: string; jobId?: string }
          const parquetFileName = `${jobId || tableName}.parquet`
          try {
            // 1. DuckDB içinde yüksek hızlı Parquet oluştur
            await conn.query(`COPY "${tableName}" TO '${parquetFileName}' (FORMAT PARQUET)`)

            // 2. Parquet buffer'ını W3C OPFS kalıcı SSD diskine kaydet (~25-50 MB)
            if (typeof navigator !== "undefined" && navigator.storage?.getDirectory) {
              const buffer = await db!.copyFileToBuffer(parquetFileName)
              if (buffer && buffer.length > 0) {
                const root = await navigator.storage.getDirectory()
                const dir = await root.getDirectoryHandle("sims_arrow_reports", { create: true })
                const fileHandle = await dir.getFileHandle(parquetFileName, { create: true })
                const writable = await fileHandle.createWritable()
                await writable.write(buffer as Uint8Array<ArrayBuffer>)
                await writable.close()
              }
            }
            self.postMessage({ id, success: true })
          } catch (err) {
            console.warn("OPFS Parquet yazma hatası, tablo korunuyor:", err)
            self.postMessage({ id, success: true })
          }
          break
        }

        case "REGISTER_PARQUET_BUFFER": {
          const { tableName, buffer } = payload
          const parquetFile = `${tableName}.parquet`
          const uint8 =
            buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer as ArrayBuffer)
          await db!.registerFileBuffer(parquetFile, uint8)
          await conn.query(`CREATE OR REPLACE VIEW "${tableName}" AS SELECT * FROM read_parquet('${parquetFile}')`)
          const countRes = await conn.query(`SELECT COUNT(*) as count FROM "${tableName}"`)
          const countRows = arrowTableToObjects(countRes)
          const rowCount = Number(countRows[0]?.count ?? 0)
          self.postMessage({ id, success: true, rowCount })
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
              throw queryErr
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
          const { tableName, jobId } = payload as { tableName: string; jobId?: string }
          const parquetFileName = `${jobId || tableName}.parquet`

          // 1. Önce bellekteki mevcut tablo veya view kontrolü (information_schema ile güvenli kontrol — hata fırlatmaz)
          try {
            const escapedName = tableName.replace(/'/g, "''")
            const checkRes = await conn.query(
              `SELECT table_name FROM information_schema.tables WHERE table_name = '${escapedName}'`
            )
            const checkRows = arrowTableToObjects(checkRes)
            if (checkRows && checkRows.length > 0) {
              const res = await conn.query(
                `SELECT COUNT(*) as count FROM "${tableName}"`
              )
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

          // 2. OPFS diskinde {jobId}.parquet var mı? (Varsa 0ms'de CREATE OR REPLACE VIEW!)
          try {
            if (typeof navigator !== "undefined" && navigator.storage?.getDirectory) {
              const root = await navigator.storage.getDirectory()
              const dir = await root.getDirectoryHandle("sims_arrow_reports", { create: true })
              const fileHandle = await dir.getFileHandle(parquetFileName, { create: false })
              const file = await fileHandle.getFile()
              if (file.size > 0) {
                const arrayBuffer = await file.arrayBuffer()
                await db!.registerFileBuffer(parquetFileName, new Uint8Array(arrayBuffer))
                await conn.query(
                  `CREATE OR REPLACE VIEW "${tableName}" AS SELECT * FROM read_parquet('${parquetFileName}')`
                )
                const countRes = await conn.query(`SELECT COUNT(*) as count FROM "${tableName}"`)
                const countRows = arrowTableToObjects(countRes)
                const rowCount = Number(countRows[0]?.count ?? 0)
                if (rowCount > 0) {
                  self.postMessage({ id, success: true, exists: true, rowCount })
                  break
                }
              }
            }
          } catch {
            // Parquet dosyası diskte yok
          }

          self.postMessage({ id, success: true, exists: false, rowCount: 0 })
          break
        }

        case "DROP_TABLE": {
          const { tableName } = payload
          await conn.query(`DROP VIEW IF EXISTS "${tableName}"`).catch(() => {})
          await conn.query(`DROP TABLE IF EXISTS "${tableName}"`).catch(() => {})
          await conn.query(`DROP TABLE IF EXISTS "${tableName}_raw"`).catch(() => {})
          await db!.dropFile(`${tableName}.parquet`).catch(() => {})
          tableRowCounts.delete(tableName)
          self.postMessage({ id, success: true })
          break
        }

        default:
          throw new Error(`Bilinmeyen mesaj tipi: ${type}`)
      }
    } catch (innerErr) {
      const msg = innerErr instanceof Error ? innerErr.message : String(innerErr)
      if (msg.includes("invalidated") || msg.includes("Out of Memory")) {
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
