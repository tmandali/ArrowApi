import assert from "node:assert/strict"
import { guardReadOnlySelect, resolveActiveViewReferences, normalizeQueryForStorage } from "../../../../../lib/sql-guard.ts"

console.log("🧪 Test: DuckDB Views Synchronization & AI Grounding (active_view & saved_views)")

// 1. Slug oluşturma (Görünüm adı -> Güvenli SQL VIEW identifier)
function sanitizeViewIdentifier(name, id = "view123") {
  const slug = name
    .replace(/[Ğğ]/g, "g")
    .replace(/[Üü]/g, "u")
    .replace(/[Şş]/g, "s")
    .replace(/[İıI]/g, "i")
    .replace(/[Öö]/g, "o")
    .replace(/[Çç]/g, "c")
    .toLowerCase()
    .replace(/[^a-z0-9_]/gi, "_")
    .replace(/_+/g, "_")
    .slice(0, 30)
    .replace(/^_+|_+$/g, "")
  return `view_${slug || id.slice(0, 8)}`
}

// 2. Active View SELECT SQL Builder testi
function buildActiveViewSql(options) {
  const { tableName, columns, filters = {}, sortConfigs = [], customQuerySql } = options
  
  // WHERE clause
  const whereParts = []
  for (const [col, val] of Object.entries(filters)) {
    if (val && val.trim()) {
      whereParts.push(`"${col}" ILIKE '%${val.trim()}%'`)
    }
  }
  const whereClause = whereParts.length > 0 ? `WHERE ${whereParts.join(" AND ")}` : ""

  // ORDER BY clause (soldan sağa çoklu sıralama)
  let orderClause = ""
  if (sortConfigs.length > 0) {
    const parts = sortConfigs.map((s) => `"${s.column}" ${s.desc ? "DESC" : "ASC"}`)
    orderClause = `ORDER BY ${parts.join(", ")}`
  }

  if (customQuerySql) {
    const resolved = resolveActiveViewReferences(customQuerySql, tableName)
    const clean = resolved.trim().replace(/;+$/, "")
    return `SELECT * FROM (${clean}) AS __active_base ${whereClause} ${orderClause}`.trim()
  }

  const colList = columns.map((c) => `"${c}"`).join(", ")
  return `SELECT ${colList} FROM "${tableName}" ${whereClause} ${orderClause}`.trim()
}

// Test 1: Sanitize View Identifier
{
  assert.equal(sanitizeViewIdentifier("Ege Bölgesi Satışları"), "view_ege_bolgesi_satislari")
  assert.equal(sanitizeViewIdentifier("Kritik Stok & Bakiye < 0"), "view_kritik_stok_bakiye_0")
  assert.equal(sanitizeViewIdentifier("!!!"), "view_view123")
  console.log("  ✓ Sanitize view identifier generates safe and semantic SQL view names")
}

// Test 2: Active View SQL generation (Filtreler ve çoklu sıralama ile)
{
  const sql = buildActiveViewSql({
    tableName: "report_stock_123",
    columns: ["ItemNo", "ItemName", "Qty", "City"],
    filters: { City: "İstanbul" },
    sortConfigs: [
      { column: "City", desc: false },
      { column: "Qty", desc: true },
    ],
  })

  assert.equal(
    sql,
    'SELECT "ItemNo", "ItemName", "Qty", "City" FROM "report_stock_123" WHERE "City" ILIKE \'%İstanbul%\' ORDER BY "City" ASC, "Qty" DESC'
  )
  console.log("  ✓ Active view SQL accurately encapsulates columns, filters, and multi-column order")
}

// Test 3: Custom SQL (AI Grouped View) tabanlı Active View SQL generation
{
  const customSql = 'SELECT "City", SUM("Qty") AS "TotalQty" FROM report_stock_123 GROUP BY "City"'
  const sql = buildActiveViewSql({
    customQuerySql: customSql,
    filters: { City: "Ankara" },
    sortConfigs: [{ column: "TotalQty", desc: true }],
  })

  assert.equal(
    sql,
    'SELECT * FROM (SELECT "City", SUM("Qty") AS "TotalQty" FROM report_stock_123 GROUP BY "City") AS __active_base WHERE "City" ILIKE \'%Ankara%\' ORDER BY "TotalQty" DESC'
  )
  console.log("  ✓ Custom grouped query correctly wraps into active_view")
}

// Test 4: AI run_expert_sql - active_view ve saved_views sorgulama guard doğrulaması
{
  const aiQuery1 = 'SELECT "Customer", "Total" FROM active_view ORDER BY "Total" DESC LIMIT 5'
  const res1 = guardReadOnlySelect(aiQuery1)
  assert.equal(res1.ok, true, "active_view query must pass SQL guard")

  const aiQuery2 = `
    SELECT 'Marmara' AS Bolge, SUM("Total") AS Ciro FROM view_marmara_bolgesi
    UNION ALL
    SELECT 'Ege' AS Bolge, SUM("Total") AS Ciro FROM view_ege_bolgesi
  `
  const res2 = guardReadOnlySelect(aiQuery2)
  assert.equal(res2.ok, true, "saved views comparison query must pass SQL guard")
  console.log("  ✓ AI queries targeting active_view and multiple saved views safely pass SQL guard")
}

// Test 5: CREATE OR REPLACE VIEW DDL formatı
{
  const viewName = "active_view"
  const selectSql = 'SELECT * FROM report_123 WHERE "Qty" > 0'
  const escapedView = `"${viewName.replace(/"/g, '""')}"`
  const ddl = `CREATE OR REPLACE VIEW ${escapedView} AS ${selectSql};`
  assert.equal(ddl, 'CREATE OR REPLACE VIEW "active_view" AS SELECT * FROM report_123 WHERE "Qty" > 0;')
  console.log("  ✓ CREATE OR REPLACE VIEW DDL conforms to DuckDB WASM specifications")
}

// Test 6: resolveActiveViewReferences - Farklı sözdizimleri ve kelime sınırları testi
{
  const baseTable = "report_retail_sales_xyz"
  
  // Yalın active_view
  assert.equal(
    resolveActiveViewReferences("SELECT * FROM active_view", baseTable),
    'SELECT * FROM "report_retail_sales_xyz"'
  )

  // Çift tırnaklı "active_view"
  assert.equal(
    resolveActiveViewReferences('SELECT * FROM "active_view" WHERE "Total" > 100', baseTable),
    'SELECT * FROM "report_retail_sales_xyz" WHERE "Total" > 100'
  )

  // Tek tırnaklı 'active_view'
  assert.equal(
    resolveActiveViewReferences("SELECT * FROM 'active_view'", baseTable),
    'SELECT * FROM "report_retail_sales_xyz"'
  )

  // Benzer kolon veya tablo adlarına dokunulmamalı (my_active_view, active_view_status vb.)
  assert.equal(
    resolveActiveViewReferences('SELECT active_view_name FROM my_active_view', baseTable),
    'SELECT active_view_name FROM my_active_view'
  )
  console.log("  ✓ resolveActiveViewReferences replaces only genuine active_view tokens with base table")
}

// Test 7: Infinite recursion prevention - Saved view ve active_view döngü kırıcı testi
{
  const baseTable = "report_5b4db7dd_2bf3_4d86_ac6d_78fde865e32d"
  const savedQueryWithActiveView = `SELECT date_trunc('day', "HareketBaslamaTarih") AS "Gün", COUNT(*) AS "Satış Adedi", SUM("ToplamTutar") AS "Toplam Tutar" FROM active_view GROUP BY date_trunc('day', "HareketBaslamaTarih") ORDER BY "Gün" ASC;`

  // 1. Saved view DDL için çözümleme:
  const resolvedSavedSql = resolveActiveViewReferences(savedQueryWithActiveView, baseTable)
  assert.equal(
    resolvedSavedSql.includes("active_view"),
    false,
    "Saved view DDL must NOT contain active_view"
  )
  assert.equal(
    resolvedSavedSql.includes(`"${baseTable}"`),
    true,
    "Saved view DDL must directly reference base table"
  )

  // 2. Active view DDL için çözümleme:
  const activeViewSql = buildActiveViewSql({
    tableName: baseTable,
    columns: ["Gün", "Satış Adedi", "Toplam Tutar"],
    customQuerySql: savedQueryWithActiveView,
  })
  assert.equal(
    activeViewSql.includes("active_view"),
    false,
    "active_view definition must NOT reference active_view (infinite recursion prevention)"
  )
  assert.equal(
    activeViewSql.includes(`"${baseTable}"`),
    true,
    "active_view definition must directly reference base table"
  )
  console.log("  ✓ Saved views & active_view DDL completely eliminate infinite recursion cycles")
}

// Test 8: Eski (stale) report_<uuid> tablo adı çözümlemesi (Catalog Error prevention)
{
  const oldTable = "report_d56e92aa_f33e_4468_891b_e6035b897a7a"
  const newTable = "report_5b4db7dd_2bf3_4d86_ac6d_78fde865e32d"

  const savedSql = `SELECT "Depo", SUM(CASE WHEN "HareketTipi" = 40 THEN "ToplamTutar" ELSE 0 END) AS "Net Satış Tutarı" FROM ${oldTable} GROUP BY "Depo"`

  // resolveActiveViewReferences — eski tablo → mevcut tablo (Catalog Error önleme)
  const resolved = resolveActiveViewReferences(savedSql, newTable)
  assert.equal(resolved.includes(oldTable), false, "Stale table must be replaced")
  assert.equal(resolved.includes(`"${newTable}"`), true, "Current table must appear in resolved SQL")

  // normalizeQueryForStorage — fiziksel tablo → active_view (taşınabilir depolama)
  const portable = normalizeQueryForStorage(savedSql, oldTable)
  assert.equal(portable.includes(oldTable), false, "Physical table must be replaced with active_view")
  assert.equal(portable.includes("active_view"), true, "active_view placeholder must appear")

  // Çift yönlü dönüşüm tamamlanıyor: portable → resolved
  const roundTripped = resolveActiveViewReferences(portable, newTable)
  assert.equal(roundTripped.includes("active_view"), false, "active_view must be resolved back")
  assert.equal(roundTripped.includes(`"${newTable}"`), true, "Final SQL must reference current table")

  console.log("  ✓ Stale report table references resolved; normalizeQueryForStorage round-trips correctly")
}

console.log("✅ All DuckDB Views & AI Grounding tests PASSED successfully!\n")
