import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveCurrentReportScope, listReportExecutionsTool } from "./job-lifecycle-tools.ts";

describe("job-lifecycle-tools", () => {
  it("resolveCurrentReportScope açıkça verilen scope'u döner", async () => {
    const scope = await resolveCurrentReportScope("Stock-Balance");
    assert.equal(scope, "stock-balance");
  });

  it("resolveCurrentReportScope boş verildiğinde ve pencere yokken boş string döner", async () => {
    const scope = await resolveCurrentReportScope();
    assert.equal(scope, "");
  });

  it("listReportExecutionsTool scope bulunamadığında tüm kayıtlı raporlar fallback'ini çalıştırır", async () => {
    const result = (await listReportExecutionsTool({})) as {
      status: string;
      report: string;
      executions: unknown[];
      total: number;
    };
    assert.equal(result.status, "ok");
    assert.equal(result.report, "all");
    assert.ok(Array.isArray(result.executions));
  });
});
