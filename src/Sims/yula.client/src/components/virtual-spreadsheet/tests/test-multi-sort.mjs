import assert from "node:assert/strict"

console.log("🧪 Test: Multi-Column Sorting (Left-to-Right Priority & SQL ORDER BY)")

// 1. DuckDB ORDER BY clause oluşturma testi
function buildOrderByClause(sortConfigs, sortBy, sortDesc) {
  if (sortConfigs && sortConfigs.length > 0) {
    const orderParts = sortConfigs.map(
      (s) => `"${s.column.replace(/"/g, '""')}" ${s.desc ? "DESC" : "ASC"}`
    )
    return `ORDER BY ${orderParts.join(", ")}`
  } else if (sortBy) {
    const escapedSort = `"${sortBy.replace(/"/g, '""')}"`
    return `ORDER BY ${escapedSort} ${sortDesc ? "DESC" : "ASC"}`
  }
  return ""
}

// 2. Soldan sağa sıralama önceliği listesi oluşturma fonksiyonu
function buildSortedColumnsList(columnOrder, sortConfigsMap) {
  const list = []
  for (const colName of columnOrder) {
    const dir = sortConfigsMap[colName]
    if (dir) {
      list.push({ column: colName, desc: dir === "desc" })
    }
  }
  return list
}

// Test 1: Tekli sıralama geriye dönük uyumluluk
{
  const clause = buildOrderByClause(null, "ItemNo", true)
  assert.equal(clause, 'ORDER BY "ItemNo" DESC')
  console.log("  ✓ Backward compatibility single-column sort works")
}

// Test 2: Çoklu sıralama - 2 kolon
{
  const sortConfigs = [
    { column: "City", desc: false },
    { column: "Balance", desc: true },
  ]
  const clause = buildOrderByClause(sortConfigs)
  assert.equal(clause, 'ORDER BY "City" ASC, "Balance" DESC')
  console.log("  ✓ Multi-column sort SQL clause generated correctly")
}

// Test 3: Soldan sağa öncelik kuralı (Left-to-Right)
{
  // Tablodaki kolon sırası: [City, Customer, Balance, Date]
  const columnOrder = ["City", "Customer", "Balance", "Date"]
  // Kullanıcı önce Date'e tıkladı, sonra City'e tıkladı
  const sortConfigsMap = {
    Date: "asc",
    City: "desc",
  }

  // Soldan sağa kuralı gereğince: Tabloda City önce geldiği için City 1. öncelik, Date 2. öncelik olmalıdır!
  const sortedList = buildSortedColumnsList(columnOrder, sortConfigsMap)
  assert.equal(sortedList.length, 2)
  assert.equal(sortedList[0].column, "City")
  assert.equal(sortedList[0].desc, true)
  assert.equal(sortedList[1].column, "Date")
  assert.equal(sortedList[1].desc, false)

  const clause = buildOrderByClause(sortedList)
  assert.equal(clause, 'ORDER BY "City" DESC, "Date" ASC')
  console.log("  ✓ Left-to-Right column ordering strictly dictates ORDER BY precedence")
}

// Test 4: Kolon sırası değiştiğinde (Drag & Drop) öncelik sırası otomatik değişir
{
  // Kullanıcı Date kolonunu tutup City'nin soluna taşıdı
  const reorderedColumns = ["Date", "City", "Customer", "Balance"]
  const sortConfigsMap = {
    Date: "asc",
    City: "desc",
  }

  const sortedList = buildSortedColumnsList(reorderedColumns, sortConfigsMap)
  assert.equal(sortedList[0].column, "Date")
  assert.equal(sortedList[1].column, "City")

  const clause = buildOrderByClause(sortedList)
  assert.equal(clause, 'ORDER BY "Date" ASC, "City" DESC')
  console.log("  ✓ Column reorder dynamically updates sorting precedence as expected")
}

// Test 5: In-Memory çoklu sıralama karşılaştırması
{
  const rows = [
    { city: "Ankara", val: 100 },
    { city: "Istanbul", val: 50 },
    { city: "Ankara", val: 200 },
    { city: "Izmir", val: 150 },
    { city: "Istanbul", val: 300 },
  ]

  // City ASC, val DESC
  const sortList = [
    { colName: "city", dir: 1, isNum: false },
    { colName: "val", dir: -1, isNum: true },
  ]

  const sorted = [...rows].sort((a, b) => {
    for (const item of sortList) {
      const aVal = a[item.colName]
      const bVal = b[item.colName]
      if (item.isNum) {
        if (aVal !== bVal) return (aVal - bVal) * item.dir
      } else {
        const cmp = String(aVal).localeCompare(String(bVal))
        if (cmp !== 0) return cmp * item.dir
      }
    }
    return 0
  })

  // Beklenen: Ankara (200), Ankara (100), Istanbul (300), Istanbul (50), Izmir (150)
  assert.equal(sorted[0].city, "Ankara")
  assert.equal(sorted[0].val, 200)
  assert.equal(sorted[1].city, "Ankara")
  assert.equal(sorted[1].val, 100)
  assert.equal(sorted[2].city, "Istanbul")
  assert.equal(sorted[2].val, 300)
  assert.equal(sorted[3].city, "Istanbul")
  assert.equal(sorted[3].val, 50)
  assert.equal(sorted[4].city, "Izmir")
  assert.equal(sorted[4].val, 150)
  console.log("  ✓ In-memory multi-column hierarchical sort verified")
}

console.log("✅ All Multi-Column Sorting tests PASSED successfully!\n")
