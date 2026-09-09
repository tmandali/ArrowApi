/**
 * Node built-in test runner: npx tsx --test src/lib/screen-snapshot.test.ts
 * Canlı ekran snapshot + tur diff'i (saf).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  snapshotScreenState,
  diffScreenSnapshots,
} from "./screen-snapshot.ts";

describe("snapshotScreenState", () => {
  it("keeps only filled criteria values", () => {
    const snap = snapshotScreenState({
      scope: "retail-sales-report",
      draftRows: [
        { name: "hareketTarihi", value: "2026-09-01..2026-09-07" },
        { name: "sirketKod", value: "  " },
      ],
    });
    assert.deepEqual(snap.criteria, {
      hareketTarihi: "2026-09-01..2026-09-07",
    });
  });

  it("shortens job ids and caps executions at 10", () => {
    const jobs = Array.from({ length: 12 }, (_, i) => ({
      id: `job-${i}-xxxxxxxx`,
      status: i === 0 ? "Running" : "Completed",
      createdAt: `2026-09-${String(i + 1).padStart(2, "0")}`,
    }));
    const snap = snapshotScreenState({ trackedJobs: jobs });
    assert.equal(snap.executions?.length, 10);
    assert.equal(snap.executions?.[0].id, "job-11-x");
  });
});

describe("diffScreenSnapshots", () => {
  it("returns [] on first turn", () => {
    assert.deepEqual(diffScreenSnapshots(null, { scope: "x" }), []);
  });

  it("reports criteria set/change/clear", () => {
    const lines = diffScreenSnapshots(
      { criteria: { a: "1", b: "2", c: "3" } },
      { criteria: { a: "1", b: "9" } },
    );
    assert.ok(lines.some((l) => l.includes('"b"') && l.includes("2") && l.includes("9")));
    assert.ok(lines.some((l) => l.includes('"c"') && l.includes("cleared")));
  });

  it("reports new jobs and status transitions", () => {
    const lines = diffScreenSnapshots(
      {
        focusedJob: { id: "oldjob12", status: "Completed" },
        executions: [{ id: "oldjob12", status: "Completed" }],
      },
      {
        focusedJob: { id: "newjob34", status: "Queued" },
        executions: [
          { id: "newjob34", status: "Queued" },
          { id: "oldjob12", status: "Completed" },
        ],
      },
    );
    assert.ok(lines.some((l) => l.includes("Focused job is now newjob34")));
    assert.ok(lines.some((l) => l.includes("New job newjob34")));
  });

  it("reports grid filter changes", () => {
    const lines = diffScreenSnapshots(
      { gridFilters: { Depo: "MERKEZ" } },
      { gridFilters: { Depo: "SUBE", Tutar: ">100" } },
    );
    assert.equal(lines.length, 2);
  });

  it("carries screen-defined custom values (capped)", () => {
    const snap = snapshotScreenState({
      extra: { selectedItem: "SKU-1", empty: "  ", big: "x".repeat(300) },
    });
    assert.equal(snap.custom?.selectedItem, "SKU-1");
    assert.ok(!("empty" in (snap.custom ?? {})));
    assert.equal(snap.custom?.big.length, 200);
  });

  it("diffs custom values", () => {
    const lines = diffScreenSnapshots(
      { custom: { selectedItem: "SKU-1" } },
      { custom: { selectedItem: "SKU-2" } },
    );
    assert.ok(lines.some((l) => l.includes("selectedItem") && l.includes("SKU-2")));
  });
});
