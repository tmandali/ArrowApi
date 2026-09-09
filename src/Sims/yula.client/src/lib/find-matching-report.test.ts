/**
 * Node built-in test runner: npx tsx --test src/lib/find-matching-report.test.ts
 * find_matching_report kriter normalizasyon + eşleşme mantığı.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isCriteriaMatch,
  normalizeCriteria,
} from "./criteria-match.ts";

describe("normalizeCriteria", () => {
  it("trims strings and keeps company code case", () => {
    const out = normalizeCriteria({ sirketKod: "  TJ01 " });
    assert.equal(out.sirketKod, "TJ01");
  });

  it("expands relative dates via resolver", () => {
    const out = normalizeCriteria(
      { hareketTarihi: "dün" },
      () => "2026-09-08",
    );
    assert.equal(out.hareketTarihi, "2026-09-08");
  });
});

describe("isCriteriaMatch", () => {
  it("matches when requested subset equals stored values", () => {
    assert.equal(
      isCriteriaMatch(
        { sirketKod: "TJ01", hareketTarihi: "2026-09-01..2026-09-07" },
        {
          sirketKod: "TJ01",
          hareketTarihi: "2026-09-01..2026-09-07",
          extraDefault: "x",
        },
      ),
      true,
    );
  });

  it("rejects case-different company codes", () => {
    assert.equal(
      isCriteriaMatch({ sirketKod: "tj01" }, { sirketKod: "TJ01" }),
      false,
    );
  });

  it("rejects empty requested criteria", () => {
    assert.equal(isCriteriaMatch({}, { sirketKod: "TJ01" }), false);
  });

  it("rejects different date ranges", () => {
    assert.equal(
      isCriteriaMatch(
        { hareketTarihi: "2026-09-01..2026-09-07" },
        { hareketTarihi: "2026-08-01..2026-08-31" },
      ),
      false,
    );
  });
});
