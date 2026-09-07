import assert from "node:assert/strict"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const filterParserPath = pathToFileURL(path.resolve(__dirname, "../../../../../services/duckdb/filter-parser.ts")).href
const filterMatcherPath = pathToFileURL(path.resolve(__dirname, "../../../../../utils/filter-matcher.ts")).href
const formatCellPath = pathToFileURL(path.resolve(__dirname, "../../../../../utils/format-cell.ts")).href

const { buildColumnWhereClause } = await import(filterParserPath)
const { matchCellFilter } = await import(filterMatcherPath)
const { formatGridCellValue } = await import(formatCellPath)

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
  console.log("  ✓ Schema INT vs DECIMAL formatting rules strictly enforced")
}

console.log("\n🎉 filter-parser testleri başarıyla tamamlandı!")
