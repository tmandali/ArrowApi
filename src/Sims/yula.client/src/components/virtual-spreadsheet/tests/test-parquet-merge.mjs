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

// 4. DuckDB Arrow IPC Chunk Stream -> Parquet (Zero-OOM Query Streaming)
{
  const colA = arrow.vectorFromArray([10, 20, 30], new arrow.Int32())
  const colB = arrow.vectorFromArray(["Depo 1", "Depo 2", "Depo 3"], new arrow.Utf8())
  const chunkTable1 = new arrow.Table({ id: colA, depo: colB })

  const colC = arrow.vectorFromArray([40, 50], new arrow.Int32())
  const colD = arrow.vectorFromArray(["Depo 4", "Depo 5"], new arrow.Utf8())
  const chunkTable2 = new arrow.Table({ id: colC, depo: colD })

  // Tıpkı duckdb.worker.ts'in ürettiği IPC stream baytları gibi:
  const ipcChunk1 = arrow.tableToIPC(chunkTable1, "stream")
  const ipcChunk2 = arrow.tableToIPC(chunkTable2, "stream")

  const ipcChunks = [ipcChunk1, ipcChunk2]
  let idx = 0

  const queryStream = new ReadableStream({
    async pull(controller) {
      if (idx >= ipcChunks.length) {
        controller.close()
        return
      }
      const rawIpc = ipcChunks[idx++]
      const wasmTable = parquetWasm.Table.fromIPCStream(rawIpc)
      const batches = wasmTable.recordBatches()
      for (const b of batches) {
        controller.enqueue(b)
      }
    }
  })

  const streamedParquet = await parquetWasm.transformParquetStream(queryStream, writerProps)
  const reader = streamedParquet.getReader()
  const outBytes = []
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (value) outBytes.push(value)
  }

  const fullLen = outBytes.reduce((acc, c) => acc + c.byteLength, 0)
  const fullBytes = new Uint8Array(fullLen)
  let pos = 0
  for (const c of outBytes) {
    fullBytes.set(c, pos)
    pos += c.byteLength
  }

  const parsedWasm = parquetWasm.readParquet(fullBytes)
  const parsedArrow = arrow.tableFromIPC(parsedWasm.intoIPCStream())
  assert.strictEqual(parsedArrow.numRows, 5, "Streamed query parquet must contain exactly 5 rows")
  assert.strictEqual(parsedArrow.get(0)?.depo, "Depo 1")
  assert.strictEqual(parsedArrow.get(4)?.depo, "Depo 5")
  console.log("  ✓ DuckDB Arrow IPC chunk-to-Parquet lazy stream verified (Zero-OOM, 5 rows)")
}

console.log("\n🎉 Parquet chunk merge testleri başarıyla tamamlandı!")
