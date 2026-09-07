import { spawnSync } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const testFiles = [
  "filter-parser.test.mjs",
  "export-formats.test.mjs",
  "test-parquet-merge.mjs",
  "test-criteria-input-engine.mjs",
  "test-aggregations.mjs",
  "test-ai-views.mjs",
]

console.log("==================================================")
console.log("🚀 Running VirtualSpreadsheet & DuckDB Grid Tests")
console.log("==================================================\n")

let allPassed = true

for (const file of testFiles) {
  const filePath = path.join(__dirname, file)
  console.log(`▶ Executing: ${file}`)
  const res = spawnSync("node", [filePath], { stdio: "inherit" })
  if (res.status !== 0) {
    console.error(`❌ ${file} FAILED with code ${res.status}`)
    allPassed = false
  } else {
    console.log(`\n--------------------------------------------------\n`)
  }
}

if (allPassed) {
  console.log("✅ ALL GRID & DUCKDB TESTS PASSED SUCCESSFULLY!")
  process.exit(0)
} else {
  console.error("❌ SOME TESTS FAILED!")
  process.exit(1)
}
