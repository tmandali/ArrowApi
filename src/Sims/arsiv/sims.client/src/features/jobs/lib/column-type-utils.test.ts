import { describe, expect, it } from "vitest"
import {
  deriveColumnKind,
  isDateLikeValue,
  isNumericLikeValue,
} from "./column-type-utils"

describe("deriveColumnKind", () => {
  it("DATE/TIMESTAMP → date", () => {
    expect(deriveColumnKind("DATE")).toBe("date")
    expect(deriveColumnKind("TIMESTAMP WITH TIME ZONE")).toBe("date")
    expect(deriveColumnKind("TIMESTAMP_MS")).toBe("date")
  })

  it("sayısal tipler → number", () => {
    expect(deriveColumnKind("INTEGER")).toBe("number")
    expect(deriveColumnKind("BIGINT")).toBe("number")
    expect(deriveColumnKind("DECIMAL(18,2)")).toBe("number")
    expect(deriveColumnKind("DOUBLE")).toBe("number")
  })

  it("BOOL → bool, VARCHAR → text", () => {
    expect(deriveColumnKind("BOOLEAN")).toBe("bool")
    expect(deriveColumnKind("VARCHAR")).toBe("text")
  })

  it("tip bilinmiyorsa isNumeric'e düşer", () => {
    expect(deriveColumnKind(undefined, true)).toBe("number")
    expect(deriveColumnKind(undefined, false)).toBe("text")
  })
})

describe("isDateLikeValue — tarih kolonu değerleri", () => {
  it.each([
    "2025-01-31",
    "2025-1-5",
    "31.01.2025",
    "31.01.25",
    "31.01",
    "2025-01-01..2025-01-31",
    "31.01..28.02",
    "today",
    "bugün",
    "dün",
  ])("geçerli: %s", (v) => {
    expect(isDateLikeValue(v)).toBe(true)
  })

  it.each([
    "kaç var",
    "kaç kayıt var",
    "how many records",
    "aktif olanlar",
    "",
    "   ",
    "abc",
  ])("geçersiz: %s", (v) => {
    expect(isDateLikeValue(v)).toBe(false)
  })
})

describe("isNumericLikeValue — sayı kolonu değerleri", () => {
  it.each([
    "100",
    "-42",
    "100..500",
    ">1000",
    "<=250",
    "<>0",
    "!0",
    "10|20|30",
    "1.5",
  ])("geçerli: %s", (v) => {
    expect(isNumericLikeValue(v)).toBe(true)
  })

  it.each(["kaç var", "kaç kayıt var", "stokta olanlar", "", "abc"])(
    "geçersiz: %s",
    (v) => {
      expect(isNumericLikeValue(v)).toBe(false)
    }
  )
})
