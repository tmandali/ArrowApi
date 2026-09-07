import assert from "node:assert/strict";

console.log("🧪 Test: Column Footer Aggregations (Airtable & Excel Standard)");

// Mock kolon tanımları
const columns = [
  { name: "ItemCode", label: "Ürün Kodu", align: "left" },
  { name: "Warehouse", label: "Depo", align: "left" },
  { name: "Qty", label: "Miktar", align: "right", isNumeric: true, duckType: "BIGINT" },
  { name: "UnitPrice", label: "Fiyat", align: "right", isNumeric: true, duckType: "DECIMAL(18,2)" },
];

const mockItems = [
  { ItemCode: "ITM01", Warehouse: "WH-A", Qty: 10, UnitPrice: 100.5 },
  { ItemCode: "ITM02", Warehouse: "WH-B", Qty: 20, UnitPrice: 200.0 },
  { ItemCode: "ITM03", Warehouse: "WH-A", Qty: 30, UnitPrice: 50.0 },
  { ItemCode: "ITM04", Warehouse: "WH-C", Qty: 0, UnitPrice: 0 },
  { ItemCode: "ITM05", Warehouse: null, Qty: null, UnitPrice: undefined },
];

// 1. In-Memory Hesaplama Testi
console.log("  ▶ Testing In-Memory Aggregations (SUM, AVG, MIN, MAX, COUNT, DISTINCT)...");

function computeMockAggregations(items, cols, configs) {
  const res = {};
  for (const col of cols) {
    const type = configs[col.name] || "none";
    if (type === "none") continue;
    const f = col.name;

    switch (type) {
      case "sum": {
        let sum = 0;
        for (const item of items) {
          const v = Number(item[f]);
          if (!isNaN(v) && item[f] !== null && item[f] !== undefined) sum += v;
        }
        res[f] = { type, value: sum };
        break;
      }
      case "avg": {
        let sum = 0, count = 0;
        for (const item of items) {
          const v = Number(item[f]);
          if (!isNaN(v) && item[f] !== null && item[f] !== undefined) {
            sum += v;
            count++;
          }
        }
        res[f] = { type, value: count > 0 ? sum / count : 0 };
        break;
      }
      case "min": {
        let min = null;
        for (const item of items) {
          const v = item[f];
          if (v === null || v === undefined) continue;
          if (min === null || v < min) min = v;
        }
        res[f] = { type, value: min };
        break;
      }
      case "max": {
        let max = null;
        for (const item of items) {
          const v = item[f];
          if (v === null || v === undefined) continue;
          if (max === null || v > max) max = v;
        }
        res[f] = { type, value: max };
        break;
      }
      case "count": {
        let count = 0;
        for (const item of items) {
          const v = item[f];
          if (v !== null && v !== undefined && v !== "") count++;
        }
        res[f] = { type, value: count };
        break;
      }
      case "distinct": {
        const set = new Set();
        for (const item of items) {
          const v = item[f];
          if (v !== null && v !== undefined && v !== "") set.add(v);
        }
        res[f] = { type, value: set.size };
        break;
      }
    }
  }
  return res;
}

const configs = {
  Qty: "sum",
  UnitPrice: "avg",
  Warehouse: "distinct",
  ItemCode: "count",
};

const res = computeMockAggregations(mockItems, columns, configs);

// Qty: 10 + 20 + 30 + 0 = 60
assert.equal(res.Qty.value, 60, "Qty SUM 60 olmalıdır");

// UnitPrice: (100.5 + 200 + 50 + 0) / 4 = 87.625
assert.equal(res.UnitPrice.value, 87.625, "UnitPrice AVG 87.625 olmalıdır");

// Warehouse DISTINCT: "WH-A", "WH-B", "WH-C" (null sayılmaz) = 3
assert.equal(res.Warehouse.value, 3, "Warehouse DISTINCT 3 olmalıdır");

// ItemCode COUNT: 5 adet dolu kayıt = 5
assert.equal(res.ItemCode.value, 5, "ItemCode COUNT 5 olmalıdır");

// 2. DuckDB SQL Üretim Testi
console.log("  ▶ Testing DuckDB SQL Aggregation Builder...");

function buildMockDuckDbAggregationSql(tableName, whereClause, cols, cfg) {
  const parts = [];
  for (const col of cols) {
    const type = cfg[col.name];
    if (!type || type === "none") continue;
    const safeCol = `"${col.name.replace(/"/g, '""')}"`;
    const alias = `agg_${type}_${col.name}`;
    if (type === "sum") parts.push(`SUM(${safeCol}) AS "${alias}"`);
    else if (type === "avg") parts.push(`AVG(${safeCol}) AS "${alias}"`);
    else if (type === "min") parts.push(`MIN(${safeCol}) AS "${alias}"`);
    else if (type === "max") parts.push(`MAX(${safeCol}) AS "${alias}"`);
    else if (type === "count") parts.push(`COUNT(${safeCol})::BIGINT AS "${alias}"`);
    else if (type === "distinct") parts.push(`COUNT(DISTINCT ${safeCol})::BIGINT AS "${alias}"`);
  }
  return `SELECT ${parts.join(", ")} FROM "${tableName}" ${whereClause};`.trim();
}

const sql = buildMockDuckDbAggregationSql("report_test_job", "WHERE \"Qty\" > 0", columns, configs);

assert.ok(sql.includes('SUM("Qty") AS "agg_sum_Qty"'), "SQL SUM(Qty) içermelidir");
assert.ok(sql.includes('AVG("UnitPrice") AS "agg_avg_UnitPrice"'), "SQL AVG(UnitPrice) içermelidir");
assert.ok(sql.includes('COUNT(DISTINCT "Warehouse")::BIGINT AS "agg_distinct_Warehouse"'), "SQL COUNT(DISTINCT Warehouse) içermelidir");
assert.ok(sql.includes('COUNT("ItemCode")::BIGINT AS "agg_count_ItemCode"'), "SQL COUNT(ItemCode) içermelidir");
assert.ok(sql.includes('FROM "report_test_job" WHERE "Qty" > 0;'), "SQL FROM ve WHERE içermelidir");

console.log("✅ All Column Footer Aggregation tests PASSED successfully!\n");
