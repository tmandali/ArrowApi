import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isJobFamily,
  isComponentFamily,
  parseComponentId,
} from "./dispatch-types";
import { describeDispatchAction } from "@/lib/my-agent-pi-bridge";

describe("dispatch-types & family safety", () => {
  describe("parseComponentId", () => {
    it("parses single component identifiers", () => {
      const res = parseComponentId("app_router");
      assert.equal(res.family, "app_router");
      assert.equal(res.subId, undefined);
    });

    it("parses scoped component identifiers", () => {
      const res = parseComponentId("criteria_form:retail-sales");
      assert.equal(res.family, "criteria_form");
      assert.equal(res.subId, "retail-sales");
    });

    it("handles subIds with multiple colons correctly", () => {
      const res = parseComponentId("arrow_job:job:999:extra");
      assert.equal(res.family, "arrow_job");
      assert.equal(res.subId, "job:999:extra");
    });
  });

  describe("isJobFamily", () => {
    it("recognizes all job family variants", () => {
      assert.equal(isJobFamily("arrow_job"), true);
      assert.equal(isJobFamily("arrow_job_manager"), true);
      assert.equal(isJobFamily("job_history"), true);
    });

    it("rejects non-job families and invalid values", () => {
      assert.equal(isJobFamily("criteria_form"), false);
      assert.equal(isJobFamily("result_grid"), false);
      assert.equal(isJobFamily("app_router"), false);
      assert.equal(isJobFamily(undefined), false);
      assert.equal(isJobFamily(null), false);
      assert.equal(isJobFamily(""), false);
    });
  });

  describe("isComponentFamily", () => {
    it("recognizes all supported component families", () => {
      const validFamilies = [
        "criteria_form",
        "result_grid",
        "app_router",
        "arrow_job",
        "arrow_job_manager",
        "job_history",
        "wasm_sql_engine",
        "entity_form",
        "plugin",
      ];
      for (const fam of validFamilies) {
        assert.equal(isComponentFamily(fam), true, `Expected ${fam} to be recognized`);
      }
    });

    it("rejects unknown families", () => {
      assert.equal(isComponentFamily("unknown_comp"), false);
      assert.equal(isComponentFamily("random"), false);
      assert.equal(isComponentFamily(undefined), false);
      assert.equal(isComponentFamily(null), false);
    });
  });

  describe("my-agent-pi-bridge trace integration", () => {
    it("describes arrow_job CANCEL action cleanly", () => {
      const trace = describeDispatchAction({
        component_id: "arrow_job:job_123",
        action: "CANCEL",
      });
      assert.equal(trace.kind, "ran");
      assert.equal(trace.label, "Cancelled job");
      assert.equal(trace.subLabel, "Job job_123");
    });

    it("describes arrow_job_manager and job_history queries cleanly", () => {
      const trace1 = describeDispatchAction({
        component_id: "arrow_job_manager",
        action: "LIST",
      });
      assert.equal(trace1.kind, "explored");
      assert.equal(trace1.label, "Job history: LIST");

      const trace2 = describeDispatchAction({
        component_id: "arrow_job:job_456",
        action: "GET_STATUS",
      });
      assert.equal(trace2.kind, "explored");
      assert.equal(trace2.label, "Job execution: GET_STATUS");
      assert.equal(trace2.subLabel, "job_456");
    });
  });
});
