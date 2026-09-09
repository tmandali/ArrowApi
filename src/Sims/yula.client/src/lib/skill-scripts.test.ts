/**
 * Node built-in test runner: npx tsx --test src/lib/skill-scripts.test.ts
 * skills dizinindeki GERÇEK betikler sandbox üzerinden koşar (uçtan uca).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createNodeSandbox } from "./skill-sandbox.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const skillsDir = path.resolve(here, "../../skills");

describe("month-range.mjs", () => {
  it("converts YYYY-MM to month bounds", async () => {
    const sb = createNodeSandbox(skillsDir);
    const { stdout } = await sb.exec({
      script: "ay-kapanis/scripts/month-range.mjs",
      args: [JSON.stringify({ month: "2026-08" })],
    });
    assert.deepEqual(JSON.parse(stdout), {
      status: "ok",
      start: "2026-08-01",
      end: "2026-08-31",
      range: "2026-08-01..2026-08-31",
      label: "Ağustos 2026",
    });
  });
  it("handles February in a leap year", async () => {
    const sb = createNodeSandbox(skillsDir);
    const { stdout } = await sb.exec({
      script: "ay-kapanis/scripts/month-range.mjs",
      args: [JSON.stringify({ month: "2024-02" })],
    });
    assert.equal(JSON.parse(stdout).end, "2024-02-29");
  });
  it("resolves last-month relative to a fixed today", async () => {
    const sb = createNodeSandbox(skillsDir);
    const { stdout } = await sb.exec({
      script: "ay-kapanis/scripts/month-range.mjs",
      args: [JSON.stringify({ relative: "last-month", today: "2026-09-09" })],
    });
    const out = JSON.parse(stdout);
    assert.equal(out.start, "2026-08-01");
    assert.equal(out.end, "2026-08-31");
  });
  it("resolves last-week Monday to Sunday", async () => {
    const sb = createNodeSandbox(skillsDir);
    const { stdout } = await sb.exec({
      script: "ay-kapanis/scripts/month-range.mjs",
      args: [JSON.stringify({ relative: "last-week", today: "2026-09-09" })],
    });
    const out = JSON.parse(stdout);
    // 2026-09-09 Çarşamba → önceki hafta Pzt 31 Ağu – Paz 6 Eyl
    assert.equal(out.start, "2026-08-31");
    assert.equal(out.end, "2026-09-06");
  });
  it("returns error JSON for bad input", async () => {
    const sb = createNodeSandbox(skillsDir);
    const { stdout } = await sb.exec({
      script: "ay-kapanis/scripts/month-range.mjs",
      args: [JSON.stringify({ month: "2026-13" })],
    });
    assert.equal(JSON.parse(stdout).status, "error");
  });
});
