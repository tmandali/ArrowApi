/**
 * Node built-in test runner: npx tsx --test src/lib/report-run-intent.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  blockedIncompleteIntent,
  hasExplicitCriteriaApplyIntent,
  hasExplicitReportRunIntent,
} from "./report-run-intent.ts";

describe("hasExplicitReportRunIntent", () => {
  it("rejects incomplete slots", () => {
    assert.equal(hasExplicitReportRunIntent("geçen hafta"), false);
    assert.equal(hasExplicitReportRunIntent("dün"), false);
    assert.equal(hasExplicitReportRunIntent("AKTIF"), false);
    assert.equal(hasExplicitReportRunIntent("Dün itibarıyla hazırla"), false);
    assert.equal(hasExplicitReportRunIntent("stok bakiyesini getir"), false);
    assert.equal(hasExplicitReportRunIntent("raporu göster"), false);
  });

  it("does not match çalışan", () => {
    assert.equal(hasExplicitReportRunIntent("son çalışan raporu aç"), false);
  });

  it("accepts explicit run verbs", () => {
    assert.equal(hasExplicitReportRunIntent("raporu çalıştır"), true);
    assert.equal(hasExplicitReportRunIntent("geçen hafta için çalıştır"), true);
    assert.equal(hasExplicitReportRunIntent("Raporu calistir"), true);
    assert.equal(hasExplicitReportRunIntent("run"), true);
    assert.equal(hasExplicitReportRunIntent("job başlat"), true);
    assert.equal(hasExplicitReportRunIntent("execute"), true);
  });
});

describe("hasExplicitCriteriaApplyIntent", () => {
  it("rejects incomplete slots", () => {
    assert.equal(hasExplicitCriteriaApplyIntent("geçen hafta"), false);
    assert.equal(hasExplicitCriteriaApplyIntent("dün"), false);
    assert.equal(hasExplicitCriteriaApplyIntent("raporu çalıştır"), false);
  });

  it("accepts apply/confirm verbs", () => {
    assert.equal(hasExplicitCriteriaApplyIntent("1. öneriyi uygula"), true);
    assert.equal(hasExplicitCriteriaApplyIntent("forma doldur"), true);
    assert.equal(hasExplicitCriteriaApplyIntent("forma yaz"), true);
    assert.equal(hasExplicitCriteriaApplyIntent("uygula"), true);
    assert.equal(hasExplicitCriteriaApplyIntent("dünü seç"), true);
  });
});

describe("blockedIncompleteIntent", () => {
  it("returns blocked without side-effect payload", () => {
    const out = blockedIncompleteIntent("run_job");
    assert.equal(out.status, "blocked");
    assert.equal(out.reason, "incomplete-intent");
    assert.ok(out.hint.length > 0);
    assert.equal(
      "jobId" in out || "navigateTo" in out || "updatedKeys" in out,
      false,
    );
  });
});
