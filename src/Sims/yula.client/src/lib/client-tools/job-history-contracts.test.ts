import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  JOB_OPEN_LAST_ACTION_CONTRACT,
  JOB_LIST_ACTION_CONTRACT,
  JOB_FIND_ACTION_CONTRACT,
  JOB_CANCEL_ACTION_CONTRACT,
  JOB_SELECT_ACTION_CONTRACT,
  JOB_REFRESH_ACTION_CONTRACT,
} from "./job-history-contracts";

describe("job-history-contracts", () => {
  it("JOB_OPEN_LAST_ACTION_CONTRACT input ve output doğrulaması yapar", () => {
    const emptyIn = JOB_OPEN_LAST_ACTION_CONTRACT.inputSchema.parse({});
    assert.equal(emptyIn.report, undefined);

    const withScope = JOB_OPEN_LAST_ACTION_CONTRACT.inputSchema.parse({
      report: "retail-sales-report",
    });
    assert.equal(withScope.report, "retail-sales-report");

    const out = JOB_OPEN_LAST_ACTION_CONTRACT.outputSchema.parse({
      status: "navigated",
      jobId: "12345",
      navigateTo: "/stock/retail-sales-report/12345",
      message: "Opened last report",
    });
    assert.equal(out.status, "navigated");
    assert.equal(out.jobId, "12345");
  });

  it("JOB_LIST_ACTION_CONTRACT limit ve executions formatını doğrular", () => {
    const parsedIn = JOB_LIST_ACTION_CONTRACT.inputSchema.parse({
      limit: 5,
    });
    assert.equal(parsedIn.limit, 5);

    const parsedOut = JOB_LIST_ACTION_CONTRACT.outputSchema.parse({
      status: "ok",
      report: "retail-sales-report",
      total: 1,
      executions: [
        {
          jobId: "job-1",
          report: "retail-sales-report",
          status: "Completed",
          createdAt: "2026-09-21T10:00:00Z",
          rowCount: 42,
        },
      ],
    });
    assert.equal(parsedOut.executions.length, 1);
    assert.equal(parsedOut.executions[0].rowCount, 42);
  });

  it("JOB_FIND_ACTION_CONTRACT query arama girdisini doğrular", () => {
    const input = JOB_FIND_ACTION_CONTRACT.inputSchema.parse({
      query: "TRLC",
      report: "retail-sales-report",
    });
    assert.equal(input.query, "TRLC");

    const out = JOB_FIND_ACTION_CONTRACT.outputSchema.parse({
      status: "ok",
      total: 0,
      matches: [],
    });
    assert.equal(out.status, "ok");
  });

  it("JOB_CANCEL_ACTION_CONTRACT zorunlu jobId parametresini doğrular", () => {
    assert.throws(() => {
      JOB_CANCEL_ACTION_CONTRACT.inputSchema.parse({});
    });

    const valid = JOB_CANCEL_ACTION_CONTRACT.inputSchema.parse({
      jobId: "cancel-me-123",
    });
    assert.equal(valid.jobId, "cancel-me-123");

    const out = JOB_CANCEL_ACTION_CONTRACT.outputSchema.parse({
      status: "ok",
      jobId: "cancel-me-123",
      message: "Cancelled",
    });
    assert.equal(out.status, "ok");
  });

  it("JOB_SELECT_ACTION_CONTRACT ve JOB_REFRESH_ACTION_CONTRACT şemalarını doğrular", () => {
    const selectIn = JOB_SELECT_ACTION_CONTRACT.inputSchema.parse({ jobId: "sel-1" });
    assert.equal(selectIn.jobId, "sel-1");

    const refreshIn = JOB_REFRESH_ACTION_CONTRACT.inputSchema.parse({});
    assert.deepEqual(refreshIn, {});

    const refreshOut = JOB_REFRESH_ACTION_CONTRACT.outputSchema.parse({ status: "ok" });
    assert.equal(refreshOut.status, "ok");
  });
});
