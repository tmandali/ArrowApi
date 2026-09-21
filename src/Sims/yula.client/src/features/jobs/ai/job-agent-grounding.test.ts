import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatJobEnginePromptGrounding,
  resolveEffectiveJobContext,
  normalizeJobState,
  isTerminalJobState,
  type ArrowJobContext,
} from "./job-agent-grounding";

describe("Arrow Jobs AI Grounding & State Resolver", () => {
  it("formats running job prompt grounding with phase and step", () => {
    const jobCtx: ArrowJobContext = {
      activeJobId: "job-guid-123",
      activeJob: {
        jobId: "job-guid-123",
        status: "Running",
        progressPhase: "calculating",
        currentStep: "Writing OPFS Batches",
      },
    };
    const res = formatJobEnginePromptGrounding(jobCtx);
    assert.ok(res?.includes('Focused Arrow Job: "job-guid-123"'));
    assert.ok(res?.includes("Status: Running"));
    assert.ok(res?.includes('Step: "Writing OPFS Batches"'));
    assert.ok(res?.includes("DO NOT run SQL"));
    assert.ok(res?.includes('component_id="arrow_job", action="CANCEL"'));
  });

  it("formats completed job prompt grounding", () => {
    const jobCtx: ArrowJobContext = {
      activeJobId: "job-guid-456",
      activeJob: {
        jobId: "job-guid-456",
        status: "Completed",
        totalRows: 450000,
        durationMs: 1500,
      },
    };
    const res = formatJobEnginePromptGrounding(jobCtx);
    assert.ok(res?.includes('Focused Arrow Job: "job-guid-456"'));
    assert.ok(res?.includes("Total Rows: 450000"));
    assert.ok(res?.includes("Duration: 1.5s"));
    assert.ok(res?.includes("result_grid:active"));
  });

  it("formats failed and cancelled job prompt grounding", () => {
    const failedCtx: ArrowJobContext = {
      activeJobId: "job-guid-fail",
      activeJob: {
        jobId: "job-guid-fail",
        status: "Failed",
        error: "Connection timeout",
      },
    };
    const failedRes = formatJobEnginePromptGrounding(failedCtx);
    assert.ok(failedRes?.includes('Status: Failed: "Connection timeout"'));
    assert.ok(failedRes?.includes("Suggest retrying"));

    const cancelledCtx: YulaJobContext = {
      activeJobId: "job-guid-canc",
      activeJob: {
        jobId: "job-guid-canc",
        status: "Cancelled",
      },
    };
    const cancelledRes = formatJobEnginePromptGrounding(cancelledCtx);
    assert.ok(cancelledRes?.includes("Status: Cancelled"));
  });

  it("falls back to raw jobId if activeJob metadata is absent", () => {
    const jobCtx: YulaJobContext = { activeJobId: "job-guid-789" };
    const res = formatJobEnginePromptGrounding(jobCtx);
    assert.equal(res, '• Focused Arrow Job: "job-guid-789" (Status: Unknown).');
  });

  it("returns null if no active job exists", () => {
    assert.equal(formatJobEnginePromptGrounding(undefined), null);
  });

  it("resolves effective job context directly from arrow_job component", () => {
    const res = resolveEffectiveJobContext(undefined, [
      {
        id: "arrow_job",
        meta: {
          jobId: "guid-dedicated",
          status: "Running",
          phase: "streaming",
          currentStep: "Writing Batches",
          totalRows: 100,
          reportScope: "retail-sales",
        },
      } as any,
    ]);
    assert.equal(res?.activeJobId, "guid-dedicated");
    assert.equal(res?.activeJob?.status, "Running");
    assert.equal(res?.activeJob?.progressPhase, "streaming");
    assert.equal(res?.activeJob?.currentStep, "Writing Batches");
    assert.equal(res?.reportScope, "retail-sales");
  });

  it("resolves effective job context from manager / history metadata", () => {
    const res = resolveEffectiveJobContext(undefined, [
      {
        id: "arrow_job_manager",
        meta: {
          reportScope: "retail-sales-report",
          selectedJobId: "guid-999",
          activeJob: {
            jobId: "guid-999",
            status: "Running",
            lastEventTitle: "Fetching Records",
          },
        },
      } as any,
    ]);
    assert.equal(res?.activeJobId, "guid-999");
    assert.equal(res?.activeJob?.status, "Running");
    assert.equal(res?.activeJob?.currentStep, "Fetching Records");
  });

  it("normalizes loose strings into strict ArrowJobLifecycleState", () => {
    assert.equal(normalizeJobState("running"), "Running");
    assert.equal(normalizeJobState("QUEUED"), "Queued");
    assert.equal(normalizeJobState("completed"), "Completed");
    assert.equal(normalizeJobState("done"), "Completed");
    assert.equal(normalizeJobState("failed"), "Failed");
    assert.equal(normalizeJobState("error"), "Failed");
    assert.equal(normalizeJobState("cancelled"), "Cancelled");
    assert.equal(normalizeJobState("canceled"), "Cancelled");
    assert.equal(normalizeJobState(""), "Idle");
    assert.equal(normalizeJobState(undefined), "Idle");
    assert.equal(normalizeJobState("random_string"), "Idle");
  });

  it("checks terminal job states accurately", () => {
    assert.equal(isTerminalJobState("Completed"), true);
    assert.equal(isTerminalJobState("Failed"), true);
    assert.equal(isTerminalJobState("Cancelled"), true);
    assert.equal(isTerminalJobState("Running"), false);
    assert.equal(isTerminalJobState("Queued"), false);
    assert.equal(isTerminalJobState("Idle"), false);
  });
});
