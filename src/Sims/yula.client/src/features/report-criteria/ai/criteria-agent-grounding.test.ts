import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatCriteriaPromptGrounding } from "./criteria-agent-grounding";

describe("CriteriaGrid / Form AI Grounding", () => {
  it("formats direct execution mode and report context correctly", () => {
    const res = formatCriteriaPromptGrounding({
      title: "Perakende Satış Raporu",
      scope: "retail-sales-report",
      workspace: "stock",
    });

    assert.ok(res.includes("ACTIVE REPORT CONTEXT RULE & DIRECT EXECUTION (Perakende Satış Raporu — retail-sales-report):"));
    assert.ok(res.includes('• The user is currently on the "Perakende Satış Raporu" report screen'));
    assert.ok(res.includes("• DIRECT EXECUTION MODE: The criteria form is active."));
  });
});
