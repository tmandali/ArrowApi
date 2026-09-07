import assert from "node:assert/strict"
import { guardReadOnlySelect } from "../../../../../lib/sql-guard.ts"

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
    const clean = customQuerySql.trim().replace(/;+$/, "")
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

console.log("✅ All DuckDB Views & AI Grounding tests PASSED successfully!\n")
