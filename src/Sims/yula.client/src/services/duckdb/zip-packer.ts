/**
 * Zero-dependency Standard PKZIP (v2.0) Packer for Web Workers & Browsers.
 * Uses native Web standard `CompressionStream("deflate-raw")` for C++ level compression.
 */

function makeCrcTable(): Uint32Array {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[i] = c >>> 0
  }
  return table
}

const CRC_TABLE = makeCrcTable()

export function calculateCrc32(buf: Uint8Array): number {
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buf[i]) & 0xff]
  }
  return (crc ^ 0xffffffff) >>> 0
}

/**
 * Tek bir dosyayı standart .zip arşivi olarak paketler.
 * Windows Gezgini, macOS Archive Utility ve Linux zip araçlarıyla %100 uyumludur.
 */
export async function createSingleFileZip(
  entryFileName: string,
  uncompressedData: Uint8Array
): Promise<Uint8Array> {
  const enc = new TextEncoder()
  const nameBytes = enc.encode(entryFileName)
  const uncompressedSize = uncompressedData.length
  const crc = calculateCrc32(uncompressedData)

  let compressedData: Uint8Array
  let compressionMethod = 8 // Deflate

  if (typeof CompressionStream !== "undefined") {
    try {
      const cs = new CompressionStream("deflate-raw")
      const writer = cs.writable.getWriter()
      void writer.write(uncompressedData as unknown as BufferSource)
      void writer.close()

      const chunks: Uint8Array[] = []
      const reader = cs.readable.getReader()
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        if (value) chunks.push(value)
      }

      const totalCompLen = chunks.reduce((acc, cur) => acc + cur.length, 0)
      compressedData = new Uint8Array(totalCompLen)
      let offset = 0
      for (const chunk of chunks) {
        compressedData.set(chunk, offset)
        offset += chunk.length
      }
    } catch {
      // Fallback: Depolama (Store / no compression)
      compressedData = uncompressedData
      compressionMethod = 0
    }
  } else {
    compressedData = uncompressedData
    compressionMethod = 0
  }

  const compressedSize = compressedData.length

  // 1. Local File Header (30 bytes + name length)
  const localHeader = new Uint8Array(30 + nameBytes.length)
  const lv = new DataView(localHeader.buffer)
  lv.setUint32(0, 0x04034b50, true) // Signature
  lv.setUint16(4, 20, true) // Version needed (2.0)
  lv.setUint16(6, 0x0800, true) // General purpose bit flag (UTF-8 filename bit 11)
  lv.setUint16(8, compressionMethod, true) // Method: 8 (deflate) or 0 (store)
  lv.setUint16(10, 0, true) // Last mod file time
  lv.setUint16(12, 0x5421, true) // Last mod file date (2022-01-01)
  lv.setUint32(14, crc, true) // CRC-32
  lv.setUint32(18, compressedSize, true) // Compressed size
  lv.setUint32(22, uncompressedSize, true) // Uncompressed size
  lv.setUint16(26, nameBytes.length, true) // File name length
  lv.setUint16(28, 0, true) // Extra field length
  localHeader.set(nameBytes, 30)

  // 2. Central Directory Header (46 bytes + name length)
  const centralHeader = new Uint8Array(46 + nameBytes.length)
  const cv = new DataView(centralHeader.buffer)
  cv.setUint32(0, 0x02014b50, true) // Signature
  cv.setUint16(4, 20, true) // Version made by
  cv.setUint16(6, 20, true) // Version needed
  cv.setUint16(8, 0x0800, true) // UTF-8 filename flag
  cv.setUint16(10, compressionMethod, true)
  cv.setUint16(12, 0, true)
  cv.setUint16(14, 0x5421, true)
  cv.setUint32(16, crc, true)
  cv.setUint32(20, compressedSize, true)
  cv.setUint32(24, uncompressedSize, true)
  cv.setUint16(28, nameBytes.length, true)
  cv.setUint16(30, 0, true) // Extra field length
  cv.setUint16(32, 0, true) // File comment length
  cv.setUint16(34, 0, true) // Disk number start
  cv.setUint16(36, 0, true) // Internal file attributes
  cv.setUint32(38, 0, true) // External file attributes
  cv.setUint32(42, 0, true) // Relative offset of local header
  centralHeader.set(nameBytes, 46)

  // 3. End of Central Directory Record (22 bytes)
  const eocd = new Uint8Array(22)
  const ev = new DataView(eocd.buffer)
  ev.setUint32(0, 0x06054b50, true) // Signature
  ev.setUint16(4, 0, true) // Number of this disk
  ev.setUint16(6, 0, true) // Disk with central directory
  ev.setUint16(8, 1, true) // Total entries on this disk
  ev.setUint16(10, 1, true) // Total entries
  ev.setUint32(12, centralHeader.length, true) // Size of central directory
  ev.setUint32(16, localHeader.length + compressedSize, true) // Offset of start of central directory
  ev.setUint16(20, 0, true) // Comment length

  // 4. Tüm parçaları birleştir
  const totalLength =
    localHeader.length + compressedSize + centralHeader.length + eocd.length
  const zipFile = new Uint8Array(totalLength)
  let pos = 0
  zipFile.set(localHeader, pos)
  pos += localHeader.length
  zipFile.set(compressedData, pos)
  pos += compressedSize
  zipFile.set(centralHeader, pos)
  pos += centralHeader.length
  zipFile.set(eocd, pos)

  return zipFile
}
