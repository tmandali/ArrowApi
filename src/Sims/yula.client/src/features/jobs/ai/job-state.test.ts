import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  resolveEffectiveJobContext,
  normalizeJobState,
  isTerminalJobState,
} from "./job-state";

describe("Arrow Jobs State & Resolver", () => {
  it("normalizes job states and terminal state predicate", () => {
    assert.equal(normalizeJobState("running"), "Running");
    assert.equal(normalizeJobState("completed"), "Completed");
    assert.equal(normalizeJobState("failed"), "Failed");
    assert.equal(isTerminalJobState("Completed"), true);
    assert.equal(isTerminalJobState("Failed"), true);
    assert.equal(isTerminalJobState("Cancelled"), true);
    assert.equal(isTerminalJobState("Running"), false);
  });

  it("resolves effective job from dedicated arrow_job component", () => {
    const res = resolveEffectiveJobContext(undefined, [
      {
        id: "arrow_job",
        meta: {
          jobId: "job-123",
          status: "Running",
          phase: "Aggregating",
          currentStep: "Scan Parquet",
          reportScope: "sales-report",
        },
      } as any,
    ]);

    assert.equal(res?.activeJobId, "job-123");
    assert.equal(res?.activeJob?.status, "Running");
    assert.equal(res?.activeJob?.progressPhase, "Aggregating");
    assert.equal(res?.reportScope, "sales-report");
  });

  it("resolves job from arrow_job_manager catalog component", () => {
    const res = resolveEffectiveJobContext(undefined, [
      {
        id: "arrow_job_manager",
        meta: {
          selectedJobId: "job-456",
          reportScope: "stock-balance",
          totalExecutions: 5,
        },
      } as any,
    ]);

    assert.equal(res?.activeJobId, "job-456");
    assert.equal(res?.reportScope, "stock-balance");
    assert.equal(res?.executionCount, 5);
  });

  it("returns undefined when no job component or context is present", () => {
    assert.equal(resolveEffectiveJobContext(undefined, []), undefined);
  });
});
