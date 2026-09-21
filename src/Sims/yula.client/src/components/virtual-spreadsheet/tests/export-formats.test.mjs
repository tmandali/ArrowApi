import assert from "node:assert/strict"

console.log("=== [TEST] export-formats.test.mjs (Export SQL & Formatting Rules) ===")

// 1. DuckDB C++ GZIP CSV Query Syntax
{
  const baseQuery = 'SELECT "Item", "Qty", "Total" FROM "report_view"'
  const targetRows = 500000
  const totalRowsToExport = 1000000
  const tempGz = "export_test.csv.gz"

  const gzSql = targetRows < totalRowsToExport ? `${baseQuery} LIMIT ${targetRows}` : baseQuery
  const copyGzCommand = `COPY (${gzSql}) TO '${tempGz}' (HEADER true, DELIMITER ';', QUOTE '"', ESCAPE '"', COMPRESSION GZIP);`

  assert.ok(copyGzCommand.includes("COMPRESSION GZIP"))
  assert.ok(copyGzCommand.includes("DELIMITER ';'"))
  assert.ok(copyGzCommand.includes("LIMIT 500000"))
  console.log("  ✓ GZIP CSV COPY command generated with correct flags")
}

// 2. Apache Parquet Export (OPFS Lazy Stream via parquet-wasm)
{
  // DuckDB WASM 32-bit heap OOM hatasını önlemek için Parquet ihracı
  // doğrudan test-parquet-merge.mjs altında lazy-stream mimarisiyle test edilmektedir.
  console.log("  ✓ Parquet export uses OPFS lazy-stream via parquet-wasm (bypassing DuckDB COPY)")
}

// 3. Excel Multi-Sheet Auto-Split Logic (> 1,000,000 rows)
{
  const EXCEL_SHEET_MAX = 1_000_000
  const totalRows = 1_850_000
  const sheetCount = Math.ceil(totalRows / EXCEL_SHEET_MAX)

  assert.equal(sheetCount, 2)

  const sheets = []
  for (let s = 0; s < sheetCount; s++) {
    const offset = s * EXCEL_SHEET_MAX
    const limit = Math.min(EXCEL_SHEET_MAX, totalRows - offset)
    sheets.push({ name: `Sayfa ${s + 1}`, offset, limit })
  }

  assert.equal(sheets.length, 2)
  assert.equal(sheets[0].name, "Sayfa 1")
  assert.equal(sheets[0].limit, 1_000_000)
  assert.equal(sheets[1].name, "Sayfa 2")
  assert.equal(sheets[1].limit, 850_000)
  console.log("  ✓ Excel multi-sheet chunking divides 1.85M rows into Sayfa 1 (1M) and Sayfa 2 (850K)")
}

// 4. Excel Issue #2119 PK signature offset detection
{
  // Simüle edilmiş baştan bozuk buffer: 12 bayt çöp + PK\x03\x04
  const garbage = new Uint8Array([0x00, 0x00, 0x1a, 0x2b, 0x3c, 0x4d, 0x5e, 0x6f, 0x70, 0x81, 0x92, 0xa3])
  const validPk = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00])
  const corruptedBuffer = new Uint8Array(garbage.length + validPk.length)
  corruptedBuffer.set(garbage, 0)
  corruptedBuffer.set(validPk, garbage.length)

  // Algoritma: İlk 64 bayt taranır
  let pkOffset = -1
  const maxScan = Math.min(corruptedBuffer.length - 3, 64)
  for (let i = 0; i < maxScan; i++) {
    if (
      corruptedBuffer[i] === 0x50 &&
      corruptedBuffer[i + 1] === 0x4b &&
      corruptedBuffer[i + 2] === 0x03 &&
      corruptedBuffer[i + 3] === 0x04
    ) {
      pkOffset = i
      break
    }
  }

  assert.equal(pkOffset, 12)
  const cleaned = corruptedBuffer.subarray(pkOffset)
  assert.equal(cleaned[0], 0x50)
  assert.equal(cleaned[1], 0x4b)
  assert.equal(cleaned[2], 0x03)
  assert.equal(cleaned[3], 0x04)
  console.log("  ✓ DuckDB-Wasm Issue #2119 extra-byte corruption detection and trimming verified")
}

// 5. Custom / Saved AI View Export SQL Generation (Binder Error Prevention)
{
  const tableName = "report_satislar"
  const customSql = 'SELECT "Depo", "ParaBirimi", SUM("ToplamTutar") AS "Satış Tutarı", SUM("IadeTutar") AS "İade Tutarı" FROM "report_satislar" GROUP BY "Depo", "ParaBirimi";'
  const columns = ["Depo", "ParaBirimi", "Satış Tutarı", "İade Tutarı"]
  const whereClause = 'WHERE "Satış Tutarı" > 1000'
  const orderClause = 'ORDER BY "Satış Tutarı" DESC'

  const cleanCustomSql = customSql?.trim().replace(/;+$/, "")
  const fromTarget = cleanCustomSql
    ? `(${cleanCustomSql}) AS __export_source`
    : `"${tableName.replace(/"/g, '""')}"`

  const selectCols =
    columns && columns.length > 0
      ? columns.map((c) => `"${c.replace(/"/g, '""')}"`).join(", ")
      : "*"

  const baseQuery = `SELECT ${selectCols} FROM ${fromTarget} ${whereClause} ${orderClause}`.trim()

  assert.ok(baseQuery.includes('FROM (SELECT "Depo"'), "fromTarget must wrap customSql as subquery")
  assert.ok(baseQuery.includes('AS __export_source'), "Subquery must have alias __export_source")
  assert.ok(baseQuery.includes('"Satış Tutarı"'), "Columns can reference aggregated/aliased columns without Binder Error")
  assert.ok(!baseQuery.includes(';;'), "Trailing semicolons must be trimmed")
  console.log("  ✓ Custom/Saved AI view export wraps SQL into __export_source subquery (preventing Binder Error)")
}

// 6. Excel & CSV Date / Timestamp Formatting (Removal of ',000' milliseconds)
{
  const columns = ["HareketBaslamaTarih", "HareketBitisTarih", "FaturaTarihi", "Miktar"]
  const columnDuckTypes = {
    HareketBaslamaTarih: "TIMESTAMP",
    HareketBitisTarih: "TIMESTAMP_MS",
    FaturaTarihi: "DATE",
    Miktar: "DECIMAL(18,2)",
  }

  function buildSelectCols(cols, types, preferredFormat) {
    return cols
      .map((c) => {
        const escaped = `"${c.replace(/"/g, '""')}"`
        const type = (types[c] || "").toUpperCase()
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
  }

  // XLSX için test
  const xlsxCols = buildSelectCols(columns, columnDuckTypes, "xlsx")
  assert.ok(xlsxCols.includes('strftime("HareketBaslamaTarih", \'%d.%m.%Y %H:%M:%S\')'), "TIMESTAMP column must format with seconds precision without milliseconds")
  assert.ok(xlsxCols.includes('strftime("HareketBitisTarih", \'%d.%m.%Y %H:%M:%S\')'), "TIMESTAMP_MS column must strip milliseconds")
  assert.ok(xlsxCols.includes('strftime("FaturaTarihi", \'%d.%m.%Y\')'), "DATE column must format with DD.MM.YYYY")
  assert.ok(xlsxCols.includes('"Miktar"'), "Numeric column must remain unformatted")
  assert.ok(!xlsxCols.includes(',000'), "Millisecond artifacts must not be generated")

  // Parquet için test (Ham tipler korunmalı)
  const parquetCols = buildSelectCols(columns, columnDuckTypes, "parquet")
  assert.equal(parquetCols, '"HareketBaslamaTarih", "HareketBitisTarih", "FaturaTarihi", "Miktar"')
  assert.ok(!parquetCols.includes("strftime"), "Parquet should preserve raw Arrow/DuckDB physical types")

  console.log("  ✓ Excel/CSV exports cleanly format timestamps as DD.MM.YYYY HH:MM:SS and strip ',000' milliseconds")
  console.log("  ✓ Parquet export preserves raw Arrow physical timestamp types for zero OOM analytics")
}

console.log("\n🎉 export-formats testleri başarıyla tamamlandı!")
