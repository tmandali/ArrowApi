import assert from "node:assert"
import * as arrow from "apache-arrow"
import * as parquetWasm from "parquet-wasm/node"

console.log("=== [TEST] test-parquet-merge.mjs (OPFS Chunk Merge & Streaming) ===")

// 1. İki ayrı Arrow table oluşturalım (chunk 1 ve chunk 2)
const c1 = arrow.vectorFromArray([1, 2, 3], new arrow.Int32())
const n1 = arrow.vectorFromArray(["a", "b", "c"], new arrow.Utf8())
const t1 = new arrow.Table({ id: c1, name: n1 })

const c2 = arrow.vectorFromArray([4, 5, 6], new arrow.Int32())
const n2 = arrow.vectorFromArray(["d", "e", "f"], new arrow.Utf8())
const t2 = new arrow.Table({ id: c2, name: n2 })

// 2. Her ikisini parquet byte'larına çevirelim (tıpkı OPFS'teki chunk'larımız gibi)
const writerProps = new parquetWasm.WriterPropertiesBuilder()
  .setCompression(parquetWasm.Compression.SNAPPY)
  .build()

const wasmT1 = parquetWasm.Table.fromIPCStream(arrow.tableToIPC(t1, "stream"))
const parquet1 = parquetWasm.writeParquet(wasmT1, writerProps)

const wasmT2 = parquetWasm.Table.fromIPCStream(arrow.tableToIPC(t2, "stream"))
const parquet2 = parquetWasm.writeParquet(wasmT2, writerProps)

assert.ok(parquet1.byteLength > 100, "Chunk 1 parquet bytes must be valid")
assert.ok(parquet2.byteLength > 100, "Chunk 2 parquet bytes must be valid")
console.log("  ✓ Individual Parquet chunks generated with Snappy compression")

// 3. Lazy pull-based stream ile birleştirmeyi test edelim
const partBuffers = [parquet1, parquet2]
let currentPartIdx = 0

const lazyStream = new ReadableStream({
  async pull(controller) {
    if (currentPartIdx >= partBuffers.length) {
      controller.close()
      return
    }
    const buf = partBuffers[currentPartIdx++]
    const wasmTable = parquetWasm.readParquet(buf)
    const batches = wasmTable.recordBatches()
    for (const b of batches) {
      controller.enqueue(b)
    }
  }
})

const parquetStream = await parquetWasm.transformParquetStream(lazyStream, writerProps)
const chunks = []
const reader = parquetStream.getReader()
while (true) {
  const { done, value } = await reader.read()
  if (done) break
  chunks.push(value)
}

const totalLen = chunks.reduce((acc, c) => acc + c.byteLength, 0)
assert.ok(totalLen > 0, "Merged stream must not be empty")

const combinedBytes = new Uint8Array(totalLen)
let offset = 0
for (const c of chunks) {
  combinedBytes.set(c, offset)
  offset += c.byteLength
}

const verifyStreamWasm = parquetWasm.readParquet(combinedBytes)
const verifyStreamArrow = arrow.tableFromIPC(verifyStreamWasm.intoIPCStream())
assert.strictEqual(verifyStreamArrow.numRows, 6, "Merged parquet must contain exactly 6 rows")
assert.strictEqual(verifyStreamArrow.get(0)?.id, 1)
assert.strictEqual(verifyStreamArrow.get(5)?.id, 6)
console.log("  ✓ Lazy pull-stream merged chunks into valid single Parquet file (6 rows verified)")

console.log("\n🎉 Parquet chunk merge testleri başarıyla tamamlandı!")
