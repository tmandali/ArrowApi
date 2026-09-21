import assert from "node:assert/strict"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const columnSizingPath = pathToFileURL(path.resolve(__dirname, "../column-sizing.ts")).href
const typesPath = pathToFileURL(path.resolve(__dirname, "../types.ts")).href

const { measureTextWidth, calculateColumnAutoFitWidth, getDefaultColumnWidth } = await import(columnSizingPath)
const { MIN_COL_WIDTH } = await import(typesPath)

console.log("=== [TEST] column-sizing.ts (Auto-Fit & Width Calculation) ===")

// 1. Minimum kolon genişliği kısıtı (MIN_COL_WIDTH = 48)
{
  assert.equal(MIN_COL_WIDTH, 48)
  console.log("  ✓ MIN_COL_WIDTH invariant is 48px")
}

// 2. Node ortamında measureTextWidth fallback (karakter başına 8px)
{
  const w = measureTextWidth("Merhaba")
  assert.equal(w, "Merhaba".length * 8)
  console.log("  ✓ measureTextWidth fallback in non-browser env works correctly")
}

// 3. getDefaultColumnWidth: Sağa hizalı sayısal kolonlar (80px - 130px)
{
  const numCol = { name: "Tutar", label: "Tutar", align: "right" }
  const wNum = getDefaultColumnWidth(numCol)
  assert.ok(wNum >= 80 && wNum <= 130, `Expected 80-130, got ${wNum}`)

  const longNumCol = { name: "ToplamNetIskontoluTutar", label: "Toplam Net İskontolu Tutar", align: "right" }
  const wLong = getDefaultColumnWidth(longNumCol)
  assert.equal(wLong, 130, "Maximum right-aligned width ceiling is 130px")
  console.log("  ✓ Numeric right-aligned default width calculated within 80px - 130px")
}

// 4. getDefaultColumnWidth: Sola hizalı metin kolonlar (100px - 220px)
{
  const textCol = { name: "Kod", label: "Kod", align: "left" }
  const wText = getDefaultColumnWidth(textCol)
  assert.ok(wText >= 100 && wText <= 220, `Expected 100-220, got ${wText}`)

  const longTextCol = { name: "Aciklama", label: "Çok Uzun Detaylı İşlem Satırı Açıklaması", align: "left" }
  const wLongText = getDefaultColumnWidth(longTextCol)
  assert.equal(wLongText, 220, "Maximum left-aligned width ceiling is 220px")
  console.log("  ✓ Text left-aligned default width calculated within 100px - 220px")
}

// 5. calculateColumnAutoFitWidth: Başlık ve içerik maksimum genişlik ve tavan (max 520px)
{
  const col = { name: "ItemName", label: "Ürün Adı", align: "left" }
  const items = [
    { values: { ItemName: "Kısa" } },
    { values: { ItemName: "Orta Boyutta Bir Ürün Adı Denemesi" } },
  ]
  const fitWidth = calculateColumnAutoFitWidth(col, items)
  assert.ok(fitWidth >= MIN_COL_WIDTH && fitWidth <= 520)
  console.log("  ✓ calculateColumnAutoFitWidth adheres to MIN_COL_WIDTH and 520px ceiling")
}

console.log("\n🎉 column-sizing testleri başarıyla tamamlandı!")
