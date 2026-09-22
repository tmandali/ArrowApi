/**
 * Pi-Style Pure TypeScript CBOR (RFC 8949) Binary Serializer & Deserializer
 * Reference: earendil-works/pi/packages/protocol/src/cbor/
 */

export class CBORCodec {
  /**
   * Herhangi bir JSON/JavaScript nesnesini ikili (binary) CBOR Uint8Array formatına kodlar.
   */
  encode(value: any): Uint8Array {
    const buffers: number[] = [];

    const writeTypeAndValue = (majorType: number, val: number) => {
      const typeBits = majorType << 5;
      if (val < 24) {
        buffers.push(typeBits | val);
      } else if (val < 0x100) {
        buffers.push(typeBits | 24, val);
      } else if (val < 0x10000) {
        buffers.push(typeBits | 25, (val >> 8) & 0xff, val & 0xff);
      } else if (val < 0x100000000) {
        buffers.push(
          typeBits | 26,
          (val >> 24) & 0xff,
          (val >> 16) & 0xff,
          (val >> 8) & 0xff,
          val & 0xff
        );
      } else {
        // 64-bit integer
        const high = Math.floor(val / 0x100000000);
        const low = val >>> 0;
        buffers.push(
          typeBits | 27,
          (high >> 24) & 0xff,
          (high >> 16) & 0xff,
          (high >> 8) & 0xff,
          high & 0xff,
          (low >> 24) & 0xff,
          (low >> 16) & 0xff,
          (low >> 8) & 0xff,
          low & 0xff
        );
      }
    };

    const serialize = (obj: any): void => {
      if (obj === null || obj === undefined) {
        buffers.push(0xf6); // null
        return;
      }

      if (typeof obj === 'boolean') {
        buffers.push(obj ? 0xf5 : 0xf4);
        return;
      }

      if (typeof obj === 'number') {
        if (Number.isInteger(obj) && obj >= 0) {
          writeTypeAndValue(0, obj);
        } else if (Number.isInteger(obj) && obj < 0) {
          writeTypeAndValue(1, -1 - obj);
        } else {
          // Double precision float
          const view = new DataView(new ArrayBuffer(8));
          view.setFloat64(0, obj);
          buffers.push(0xfb, ...Array.from(new Uint8Array(view.buffer)));
        }
        return;
      }

      if (typeof obj === 'string') {
        const utf8Bytes = new TextEncoder().encode(obj);
        writeTypeAndValue(3, utf8Bytes.length);
        for (let i = 0; i < utf8Bytes.length; i++) {
          buffers.push(utf8Bytes[i]);
        }
        return;
      }

      if (Array.isArray(obj)) {
        writeTypeAndValue(4, obj.length);
        for (const item of obj) {
          serialize(item);
        }
        return;
      }

      if (typeof obj === 'object') {
        const keys = Object.keys(obj);
        writeTypeAndValue(5, keys.length);
        for (const key of keys) {
          serialize(key);
          serialize(obj[key]);
        }
        return;
      }
    };

    serialize(value);
    return new Uint8Array(buffers);
  }

  /**
   * CBOR ikili baytlarını JavaScript nesnesine geri dönüştürür.
   */
  decode(bytes: Uint8Array): any {
    let offset = 0;

    const readTypeAndValue = (): { major: number; value: number } => {
      const initial = bytes[offset++];
      const major = initial >> 5;
      const additional = initial & 0x1f;

      if (additional < 24) return { major, value: additional };
      if (additional === 24) return { major, value: bytes[offset++] };
      if (additional === 25) {
        const val = (bytes[offset] << 8) | bytes[offset + 1];
        offset += 2;
        return { major, value: val };
      }
      if (additional === 26) {
        const view = new DataView(bytes.buffer, bytes.byteOffset + offset, 4);
        offset += 4;
        return { major, value: view.getUint32(0) };
      }
      if (additional === 27) {
        const view = new DataView(bytes.buffer, bytes.byteOffset + offset, 8);
        offset += 8;
        return { major, value: Number(view.getBigUint64(0)) };
      }

      return { major, value: additional };
    };

    const deserialize = (): any => {
      if (offset >= bytes.length) return undefined;

      const initial = bytes[offset];
      if (initial === 0xf4) { offset++; return false; }
      if (initial === 0xf5) { offset++; return true; }
      if (initial === 0xf6 || initial === 0xf7) { offset++; return null; }
      if (initial === 0xfb) {
        offset++;
        const view = new DataView(bytes.buffer, bytes.byteOffset + offset, 8);
        offset += 8;
        return view.getFloat64(0);
      }

      const { major, value } = readTypeAndValue();

      if (major === 0) return value;
      if (major === 1) return -1 - value;
      if (major === 3) {
        const strBytes = bytes.subarray(offset, offset + value);
        offset += value;
        return new TextDecoder().decode(strBytes);
      }
      if (major === 4) {
        const arr = [];
        for (let i = 0; i < value; i++) arr.push(deserialize());
        return arr;
      }
      if (major === 5) {
        const obj: Record<string, any> = {};
        for (let i = 0; i < value; i++) {
          const k = deserialize();
          const v = deserialize();
          obj[k] = v;
        }
        return obj;
      }

      return null;
    };

    return deserialize();
  }

  /**
   * JSON ve CBOR arasındaki bayt boyutu farkını ve tasarruf oranını hesaplar.
   */
  comparePayloadSizes(data: any): {
    jsonBytes: number;
    cborBytes: number;
    savingsPercent: number;
    formatted: string;
  } {
    const jsonStr = JSON.stringify(data);
    const jsonBytes = new TextEncoder().encode(jsonStr).length;
    const cborBytes = this.encode(data).length;
    const savings = jsonBytes > 0 ? Math.round(((jsonBytes - cborBytes) / jsonBytes) * 100) : 0;

    return {
      jsonBytes,
      cborBytes,
      savingsPercent: Math.max(0, savings),
      formatted: `JSON: ${jsonBytes} B | CBOR: ${cborBytes} B (%${Math.max(0, savings)} Tasarruf)`,
    };
  }
}

export const cborCodec = new CBORCodec();
