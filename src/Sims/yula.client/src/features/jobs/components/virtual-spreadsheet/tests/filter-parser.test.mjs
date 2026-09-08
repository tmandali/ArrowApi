import assert from "node:assert/strict"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const filterParserPath = pathToFileURL(path.resolve(__dirname, "../../../../../services/duckdb/filter-parser.ts")).href
const filterMatcherPath = pathToFileURL(path.resolve(__dirname, "../../../../../utils/filter-matcher.ts")).href
const formatCellPath = pathToFileURL(path.resolve(__dirname, "../../../../../utils/format-cell.ts")).href
const arrowDecimalPath = pathToFileURL(path.resolve(__dirname, "../../../../../utils/arrow-decimal.ts")).href

const { buildColumnWhereClause } = await import(filterParserPath)
const { matchCellFilter } = await import(filterMatcherPath)
const { formatGridCellValue } = await import(formatCellPath)
const {
  arrowDecimalToNumber,
  formatTimeOfDayValue,
  isTimeOnlyType,
  isUuidBinaryType,
  normalizeArrowCellValue,
  readDecimalScale,
} = await import(arrowDecimalPath)

console.log("=== [TEST] filter-parser.ts (DuckDB SQL Generation) ===")

// 1. Veride boşluk olan ve tek kelime aranan durumlar:
// Kullanıcı "Elma" aradığında, TRIM(CAST("Item" AS VARCHAR)) ILIKE '%Elma%' üretilmeli
{
  const sql = buildColumnWhereClause("Item", "Elma", false)
  console.log("  ✓ Item contains 'Elma':", sql)
  assert.ok(sql?.includes("TRIM(CAST(\"Item\" AS VARCHAR)) ILIKE '%Elma%'"))
}

// 2. Çoklu kelime (arada boşluk olan arama terimi): "Elma Sirke"
// Her iki kelime için ILIKE '%Elma%' AND ILIKE '%Sirke%' üretilmeli
{
  const sql = buildColumnWhereClause("Item", "Elma Sirke", false)
  console.log("  ✓ Item multi-word 'Elma Sirke':", sql)
  assert.ok(sql?.includes("ILIKE '%Elma%'"))
  assert.ok(sql?.includes("ILIKE '%Sirke%'"))
  assert.ok(sql?.includes(" AND "))
}

// 3. Veride boş hücre kontrolü: '' veya boş veya null
{
  const sqlEmpty1 = buildColumnWhereClause("Item", "''", false)
  assert.ok(sqlEmpty1?.includes('"Item" IS NULL OR TRIM(CAST("Item" AS VARCHAR)) = \'\''))

  const sqlEmpty2 = buildColumnWhereClause("Item", "boş", false)
  assert.ok(sqlEmpty2?.includes('"Item" IS NULL OR TRIM(CAST("Item" AS VARCHAR)) = \'\''))

  const sqlEmpty3 = buildColumnWhereClause("Item", "null", false)
  assert.ok(sqlEmpty3?.includes('"Item" IS NULL OR TRIM(CAST("Item" AS VARCHAR)) = \'\''))
  console.log("  ✓ Empty keywords ('', boş, null) mapped correctly")
}

// 4. Dolu hücre kontrolü: <>'' veya dolu
{
  const sqlNotEmpty1 = buildColumnWhereClause("Item", "<>''", false)
  assert.ok(sqlNotEmpty1?.includes('"Item" IS NOT NULL AND TRIM(CAST("Item" AS VARCHAR)) != \'\''))

  const sqlNotEmpty2 = buildColumnWhereClause("Item", "dolu", false)
  assert.ok(sqlNotEmpty2?.includes('"Item" IS NOT NULL AND TRIM(CAST("Item" AS VARCHAR)) != \'\''))
  console.log("  ✓ Not empty keywords (<>'', dolu) mapped correctly")
}

// 5. İçinde boşluklu tire olan metin ("MERKEZ - ŞUBE"):
// Aralık sayılmamalı, metin araması olarak ILIKE üretilmeli
{
  const sqlDash = buildColumnWhereClause("Name", "MERKEZ - ŞUBE", false)
  assert.ok(!sqlDash?.includes(">="), "Metin tiresi aralık olmamalı")
  assert.ok(sqlDash?.includes("MERKEZ"))
  console.log("  ✓ Hyphenated text ('MERKEZ - ŞUBE') not misidentified as range")
}

// 6. Gerçek sayısal ve tarih aralıkları (100..500 veya 10 - 50):
{
  const sqlDotRange = buildColumnWhereClause("Qty", "100..500", true)
  assert.ok(sqlDotRange?.includes('>= 100 AND "Qty" <= 500'))

  const sqlDashRange = buildColumnWhereClause("Qty", "10 - 50", true)
  assert.ok(sqlDashRange?.includes('>= 10 AND "Qty" <= 50'))
  console.log("  ✓ Numeric ranges ('100..500', '10 - 50') generated correctly")
}

// 7. Karşılaştırma operatörleri (>=, <=, >, <, =)
{
  assert.ok(buildColumnWhereClause("Qty", ">=50", true)?.includes('"Qty" >= 50'))
  assert.ok(buildColumnWhereClause("Qty", "<=100", true)?.includes('"Qty" <= 100'))
  assert.ok(buildColumnWhereClause("Qty", ">0", true)?.includes('"Qty" > 0'))
  assert.ok(buildColumnWhereClause("Qty", "=25", true)?.includes('"Qty" = 25'))
  console.log("  ✓ Comparison operators (>=, <=, >, <, =) generated correctly")
}

console.log("\n=== [TEST] filter-matcher.ts (Client-side In-memory Parity) ===")

// 8. Client-side: Veride boşluk var ("Elma Sirkesi 500ML")
{
  const cell = "Elma Sirkesi 500ML"
  assert.equal(matchCellFilter(cell, "Elma"), true)
  assert.equal(matchCellFilter(cell, "Sirkesi"), true)
  assert.equal(matchCellFilter(cell, "500ML"), true)
  assert.equal(matchCellFilter(cell, "elma"), true)
  assert.equal(matchCellFilter(cell, "Armut"), false)
  console.log("  ✓ In-memory token search matches regardless of word order/casing")
}

// 9. Client-side: Boş ve dolu hücre kontrolleri
{
  assert.equal(matchCellFilter(null, "''"), true)
  assert.equal(matchCellFilter("", "''"), true)
  assert.equal(matchCellFilter("   ", "''"), true)
  assert.equal(matchCellFilter(null, "boş"), true)
  assert.equal(matchCellFilter("", "null"), true)
  assert.equal(matchCellFilter("Dolu", "''"), false)
  assert.equal(matchCellFilter("Dolu", "<>''"), true)
  assert.equal(matchCellFilter(null, "<>''"), false)
  console.log("  ✓ In-memory empty/not-empty filter matches DuckDB SQL behavior")
}

console.log("\n=== [TEST] formatGridCellValue (Schema-driven Format: INT vs DECIMAL vs DATE) ===")

// 10. Şema tipi INT olan alanlar (SatisID, BelgeNo, Barcode) asla binlik nokta almaz
{
  assert.equal(formatGridCellValue(44577625, "right", "BIGINT"), "44577625")
  assert.equal(formatGridCellValue(44577625, "right", "INTEGER"), "44577625")
  assert.equal(formatGridCellValue(44577625, "left", "INT4"), "44577625")
  assert.equal(formatGridCellValue(44577625, "right", "INT8"), "44577625")
  assert.equal(formatGridCellValue(2026, "right", "SMALLINT"), "2026")
  assert.equal(formatGridCellValue(44577625, "left"), "44577625")

  // DECIMAL, FLOAT, DOUBLE olan tutar/parasal alanlar Türkçe formatlanır:
  assert.equal(formatGridCellValue(1250.5, "right", "DECIMAL(18,2)"), "1.250,50")
  assert.equal(formatGridCellValue(250000, "right", "DOUBLE"), "250.000,00")
  assert.equal(formatGridCellValue(15.75, "right", "FLOAT"), "15,75")

  // Arrow DecimalBigNum.toJSON artifact (`"10401"`) + DECIMAL(16,2) scale → 104.01
  assert.equal(formatGridCellValue('"10401"', "right", "DECIMAL(16,2)"), "104,01")
  // Düz sayısal string scale uygulanmaz (gerçek 10401 değeri)
  assert.equal(formatGridCellValue(10401, "right", "DECIMAL(16,2)"), "10.401,00")

  // DATE ve TIMESTAMP alanları: Saat bilgisi varsa saatli (DD.MM.YYYY HH:mm:ss), yoksa salt gün (DD.MM.YYYY)
  assert.equal(formatGridCellValue("2026-09-01T20:18:57", "left", "TIMESTAMP"), "01.09.2026 20:18:57")
  assert.equal(formatGridCellValue("2026-09-01 20:18:57", "left", "TIMESTAMP"), "01.09.2026 20:18:57")
  assert.equal(formatGridCellValue("2026-09-01T20:18:57.000Z", "left", "TIMESTAMP"), "01.09.2026 20:18:57")
  assert.equal(formatGridCellValue("2026-09-01T00:00:00.000Z", "left", "TIMESTAMP"), "01.09.2026")
  assert.equal(formatGridCellValue("2026-09-01", "left", "DATE"), "01.09.2026")
  assert.equal(formatGridCellValue("01.09.2026 20:18:57", "left", "TIMESTAMP"), "01.09.2026 20:18:57")
  // UTC gece yarısı Date — TR yerel saatte 03:00 olsa bile DATE kolonunda saat yok
  assert.equal(
    formatGridCellValue(new Date("2026-09-01T00:00:00.000Z"), "left", "DATE"),
    "01.09.2026"
  )
  assert.equal(
    formatGridCellValue(new Date("2026-09-01T00:00:00.000Z"), "left", "TIMESTAMP"),
    "01.09.2026"
  )

  // TIME — tarih epoch sanılmamalı
  assert.equal(formatGridCellValue("14:30:05", "left", "TIME"), "14:30:05")
  assert.equal(formatGridCellValue(14 * 3600 + 30 * 60 + 5, "left", "TIME"), "14:30:05")
  // Time64 nanoseconds since midnight
  assert.equal(
    formatGridCellValue(BigInt((14 * 3600 + 30 * 60 + 5) * 1_000_000_000), "left", "TIME"),
    "14:30:05"
  )

  // money / DECIMAL scale
  assert.equal(formatGridCellValue(12.3456, "right", "DECIMAL(19,4)"), "12,3456")
  assert.equal(formatGridCellValue(12.34, "right", "FLOAT"), "12,34")

  // BOOLEAN alanları: Şema BOOL/BIT olduğunda 1/0 ve true/false standart olarak 'Evet'/'Hayır' basılır
  assert.equal(formatGridCellValue(true, "left", "BOOLEAN"), "Evet")
  assert.equal(formatGridCellValue(false, "left", "BOOLEAN"), "Hayır")
  assert.equal(formatGridCellValue(1, "left", "BOOLEAN"), "Evet")
  assert.equal(formatGridCellValue(0, "left", "BOOLEAN"), "Hayır")
  assert.equal(formatGridCellValue(1, "left", "BIT"), "Evet")
  assert.equal(formatGridCellValue(0, "left", "BIT"), "Hayır")
  assert.equal(formatGridCellValue("true", "left"), "Evet")
  assert.equal(formatGridCellValue("false", "left"), "Hayır")

  console.log("  ✓ Schema INT vs DECIMAL formatting rules strictly enforced")
  console.log("  ✓ DATE & TIMESTAMP formatting preserves hours/minutes/seconds in virtual grid cells")
  console.log("  ✓ BOOLEAN / BIT fields reliably format as 'Evet' / 'Hayır' across all reports")
}

// 11. Boolean SQL & In-Memory Filter Matcher Parity
{
  // SQL WHERE clause doğrulaması
  const trueSql = buildColumnWhereClause("IsActive", "evet", false, true)
  assert.ok(trueSql.includes('TRY_CAST("IsActive" AS BOOLEAN) = true'), "True query must cast to boolean")
  assert.ok(trueSql.includes('"IsActive" AS VARCHAR)) = \'1\''), "True query must match '1'")

  const falseSql = buildColumnWhereClause("IsActive", "hayır", false, true)
  assert.ok(falseSql.includes('TRY_CAST("IsActive" AS BOOLEAN) = false'), "False query must cast to boolean")
  assert.ok(falseSql.includes('"IsActive" AS VARCHAR)) = \'0\''), "False query must match '0'")

  // In-memory matcher doğrulaması (true/false, 1/0, Evet/Hayır)
  assert.equal(matchCellFilter(true, "evet"), true)
  assert.equal(matchCellFilter(false, "evet"), false)
  assert.equal(matchCellFilter(1, "evet"), true)
  assert.equal(matchCellFilter(0, "evet"), false)
  assert.equal(matchCellFilter("Evet", "evet"), true)
  assert.equal(matchCellFilter("Hayır", "evet"), false)

  assert.equal(matchCellFilter(false, "hayır"), true)
  assert.equal(matchCellFilter(true, "hayır"), false)
  assert.equal(matchCellFilter(0, "hayır"), true)
  assert.equal(matchCellFilter(1, "hayır"), false)
  assert.equal(matchCellFilter("Hayır", "hayır"), true)
  assert.equal(matchCellFilter("Evet", "hayır"), false)

  console.log("  ✓ Boolean filter parsing and in-memory matching fully verified for Evet/Hayır and 1/0")
}

console.log("\n=== [TEST] arrow-decimal (Decimal128 scale + TIME/UUID helpers) ===")
{
  assert.equal(readDecimalScale("DECIMAL(16,2)"), 2)
  assert.equal(readDecimalScale("Decimal[16e+2]"), 2)
  assert.equal(readDecimalScale({ scale: 4 }), 4)
  assert.equal(arrowDecimalToNumber('"10401"', 2), 104.01)
  assert.equal(normalizeArrowCellValue('"10401"', "DECIMAL(16,2)"), 104.01)
  assert.equal(arrowDecimalToNumber(10401n, 2), 104.01)
  assert.equal(formatTimeOfDayValue(14 * 3600 + 30 * 60), "14:30:00")
  assert.equal(formatTimeOfDayValue("9:05:01"), "09:05:01")
  assert.equal(isTimeOnlyType("TIME"), true)
  assert.equal(isTimeOnlyType("TIMESTAMP"), false)
  assert.equal(isUuidBinaryType("FixedSizeBinary[16]"), true)
  assert.equal(isUuidBinaryType("BLOB"), false)
  console.log("  ✓ Decimal scale parse + TIME/UUID type helpers")
}

console.log("\n🎉 filter-parser testleri başarıyla tamamlandı!")
