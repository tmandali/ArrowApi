import * as duckdb from "@duckdb/duckdb-wasm"
import { arrowTableToObjects } from "./wasm-sql-arrow-normalize"

export async function handleExportTable(
  conn: duckdb.AsyncDuckDBConnection,
  db: duckdb.AsyncDuckDB,
  payload: any,
  postResponse: (data: any, transfer?: Transferable[]) => void
) {
  const {
    tableName,
    columns,
    whereClause = "",
    orderClause = "",
    fileName = "rapor",
    preferredFormat = "xlsx",
    maxRowsPerSheet = 1_000_000,
    maxTotalRows,
    customSql,
    columnDuckTypes: clientDuckTypes = {},
  } = payload as {
    tableName: string
    columns?: string[]
    columnDuckTypes?: Record<string, string>
    whereClause?: string
    orderClause?: string
    fileName?: string
    preferredFormat?: "xlsx" | "csv" | "parquet" | "gz"
    maxRowsPerSheet?: number
    maxTotalRows?: number
    customSql?: string
  }

  const cleanCustomSql = customSql?.trim().replace(/;+$/, "")
  const fromTarget = cleanCustomSql
    ? `(${cleanCustomSql}) AS __export_source`
    : `"${tableName.replace(/"/g, '""')}"`

  // Tablo / View kolon tiplerini belirle (Tarih/Timestamp alanlarını Excel ve CSV için temiz formatlamak amacıyla)
  const columnDuckTypes: Record<string, string> = { ...clientDuckTypes }
  try {
    const descRes = await conn.query(`DESCRIBE SELECT * FROM ${fromTarget} LIMIT 0;`)
    const descRows = arrowTableToObjects(descRes)
    for (const r of descRows as any[]) {
      const cName = String(r.column_name ?? r.name ?? "")
      const cType = String(r.column_type ?? r.type ?? "").toUpperCase()
      if (cName) {
        columnDuckTypes[cName] = cType
      }
    }
  } catch (descErr) {
    console.warn("[duckdb.worker] EXPORT_TABLE schema describe error:", descErr)
  }

  const colsToSelect =
    columns && columns.length > 0 ? columns : Object.keys(columnDuckTypes)

  const selectCols =
    colsToSelect.length > 0
      ? colsToSelect
          .map((c) => {
            const escaped = `"${c.replace(/"/g, '""')}"`
            const type = (columnDuckTypes[c] || "").toUpperCase()
            // Excel (.xlsx) ve CSV/GZ insan tarafından açılan dosyalarda tarih/saat alanlarını formatla
            if (preferredFormat !== "parquet") {
              if (type.includes("TIMESTAMP")) {
                return `CASE WHEN ${escaped} IS NULL THEN NULL WHEN strftime(${escaped}, '%H:%M:%S') = '00:00:00' THEN strftime(${escaped}, '%d.%m.%Y') ELSE strftime(${escaped}, '%d.%m.%Y %H:%M:%S') END AS ${escaped}`
              }
              if (type.includes("DATE")) {
                return `CASE WHEN ${escaped} IS NULL THEN NULL ELSE strftime(${escaped}, '%d.%m.%Y') END AS ${escaped}`
              }
              if (type.includes("TIME")) {
                return `CASE WHEN ${escaped} IS NULL THEN NULL ELSE strftime(${escaped}, '%H:%M:%S') END AS ${escaped}`
              }
            }
            return escaped
          })
          .join(", ")
      : "*"

  const baseQuery = `SELECT ${selectCols} FROM ${fromTarget} ${whereClause} ${orderClause}`.trim()

  let totalRowsToExport = 0
  try {
    const countRes = await conn.query(
      `SELECT COUNT(*)::BIGINT as cnt FROM ${fromTarget} ${whereClause};`
    )
    const countRows = arrowTableToObjects(countRes)
    totalRowsToExport = Number(countRows[0]?.cnt ?? 0)
  } catch {
    totalRowsToExport = 0
  }

  const targetRows =
    maxTotalRows && maxTotalRows > 0 && maxTotalRows < totalRowsToExport
      ? maxTotalRows
      : totalRowsToExport

  let format: "xlsx" | "csv" | "parquet" | "gz" = "gz"
  let outFileName = ""
  let fileBuffer: Uint8Array | null = null
  let sheetCount = 1

  // 2. xlsx formatı istendiyse DuckDB excel eklentisini dene
  if (!fileBuffer && preferredFormat === "xlsx") {
    try {
      await conn.query("LOAD excel;").catch(async () => {
        await conn.query("INSTALL excel; LOAD excel;")
      })
      const tempXlsx = `export_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.xlsx`
      const chunkSize = Math.min(Math.max(10_000, maxRowsPerSheet), 1_000_000)

      if (targetRows > chunkSize) {
        sheetCount = Math.ceil(targetRows / chunkSize)
        for (let s = 0; s < sheetCount; s++) {
          const offset = s * chunkSize
          const currentChunk = Math.min(chunkSize, targetRows - offset)
          const sheetName = `Sayfa ${s + 1}`
          const modeClause = s === 0 ? "MODE 'create'" : "MODE 'append'"
          const chunkSql = `${baseQuery} LIMIT ${currentChunk} OFFSET ${offset}`
          await conn.query(
            `COPY (${chunkSql}) TO '${tempXlsx}' (FORMAT xlsx, HEADER true, SHEET '${sheetName}', ${modeClause});`
          )
        }
      } else {
        const singleSql =
          targetRows < totalRowsToExport
            ? `${baseQuery} LIMIT ${targetRows}`
            : baseQuery
        await conn.query(
          `COPY (${singleSql}) TO '${tempXlsx}' (FORMAT xlsx, HEADER true, SHEET 'Sayfa 1');`
        )
      }

      const rawBuffer = await db.copyFileToBuffer(tempXlsx)
      await db.dropFile(tempXlsx).catch(() => {})

      let pkOffset = -1
      for (let i = 0; i < Math.min(rawBuffer.length - 3, 64); i++) {
        if (
          rawBuffer[i] === 0x50 &&
          rawBuffer[i + 1] === 0x4b &&
          rawBuffer[i + 2] === 0x03 &&
          rawBuffer[i + 3] === 0x04
        ) {
          pkOffset = i
          break
        }
      }

      if (pkOffset === -1) {
        throw new Error("Üretilen Excel dosyasında geçerli ZIP/XLSX (PK) imzası bulunamadı.")
      }

      const clean = pkOffset > 0 ? rawBuffer.subarray(pkOffset) : rawBuffer
      fileBuffer = new Uint8Array(clean)
      format = "xlsx"
      outFileName = `${fileName}.xlsx`
    } catch (xlsxErr) {
      console.warn(
        "[duckdb.worker] Excel extension export failed, falling back to UTF-8 BOM CSV:",
        xlsxErr
      )
      fileBuffer = null
      sheetCount = 1
    }
  }

  // 3. GZ formatı (DuckDB C++ yerel GZIP streaming akışı)
  if (!fileBuffer && preferredFormat === "gz") {
    try {
      const tempGz = `export_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.csv.gz`
      const gzSql =
        targetRows < totalRowsToExport
          ? `${baseQuery} LIMIT ${targetRows}`
          : baseQuery
      await conn.query(
        `COPY (${gzSql}) TO '${tempGz}' (HEADER true, DELIMITER ';', QUOTE '"', ESCAPE '"', COMPRESSION GZIP);`
      )
      const rawGzBuffer = await db.copyFileToBuffer(tempGz)
      await db.dropFile(tempGz).catch(() => {})

      fileBuffer = rawGzBuffer
      format = "gz"
      outFileName = `${fileName}.csv.gz`
    } catch (gzErr) {
      console.warn(
        "[duckdb.worker] GZIP export failed, falling back to raw CSV/ZIP:",
        gzErr
      )
      fileBuffer = null
    }
  }

  // 4. CSV Fallback
  if (!fileBuffer) {
    const tempCsv = `export_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.csv`
    const csvSql =
      targetRows < totalRowsToExport
        ? `${baseQuery} LIMIT ${targetRows}`
        : baseQuery
    await conn.query(
      `COPY (${csvSql}) TO '${tempCsv}' (HEADER true, DELIMITER ';', QUOTE '"', ESCAPE '"');`
    )
    const rawCsvBuffer = await db.copyFileToBuffer(tempCsv)
    await db.dropFile(tempCsv).catch(() => {})

    const bom = new Uint8Array([0xef, 0xbb, 0xbf])
    const csvWithBom = new Uint8Array(bom.length + rawCsvBuffer.length)
    csvWithBom.set(bom, 0)
    csvWithBom.set(rawCsvBuffer, bom.length)

    fileBuffer = csvWithBom
    format = "csv"
    outFileName = `${fileName}.csv`
  }

  const transferBuffer = fileBuffer.buffer.slice(
    fileBuffer.byteOffset,
    fileBuffer.byteOffset + fileBuffer.byteLength
  ) as ArrayBuffer

  postResponse(
    {
      action: "EXPORT_TABLE_RESPONSE",
      buffer: transferBuffer,
      format,
      fileName: outFileName,
      totalRows: targetRows,
      sheetCount,
    },
    [transferBuffer]
  )
}
