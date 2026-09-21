import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { generateDecisionTreeMermaid } from "./decision-tree-mermaid";
import type { AgentStepFrame } from "@my-agent/core";

describe("decision-tree-mermaid", () => {
  it("generates fallback flowchart when empty", () => {
    const chart = generateDecisionTreeMermaid([]);
    assert.ok(chart.includes("flowchart TD"));
    assert.ok(chart.includes("Empty"));
  });

  it("generates connected DAG with success, error, and recovery nodes", () => {
    const steps: AgentStepFrame[] = [
      {
        id: "step-1",
        conversationId: "conv-1",
        stepIndex: 0,
        status: "error",
        isError: true,
        thought: "Active view kolonlarını incele",
        actionTool: "RUN_SQL",
        actionInput: { query: "DESCRIBE active_view" },
        errorMessage: "SQL query is empty.",
      },
      {
        id: "step-2",
        conversationId: "conv-1",
        stepIndex: 1,
        parentStepId: "step-1",
        status: "recovered",
        thought: "Yedek sorgu olarak 1 satır çek",
        actionTool: "RUN_SQL",
        actionInput: { query: "SELECT * FROM active_view LIMIT 1" },
        transitionReason: "Yedek şema kurtarma adımı",
      },
      {
        id: "step-3",
        conversationId: "conv-1",
        stepIndex: 2,
        parentStepId: "step-2",
        status: "success",
        thought: "Depo bazlı toplam ciroyu hesapla",
        actionTool: "RUN_SQL",
        actionInput: { query: "SELECT Depo, SUM(Tutar) FROM active_view GROUP BY Depo" },
      },
    ];

    const chart = generateDecisionTreeMermaid(steps, "Test Turu");
    assert.ok(chart.includes("flowchart TD"));
    assert.ok(chart.includes("Start --> Step_1"));
    assert.ok(chart.includes('Step_1["<b>Adım 1: RUN_SQL</b>'));
    assert.ok(chart.includes(']:::error'));
    assert.ok(chart.includes(']:::recovery'));
    assert.ok(chart.includes(']:::success'));
    assert.ok(chart.includes('Step_1 -- "❌ SQL query is empty. (Kurtarma)" --> Step_2'));
    assert.ok(chart.includes("Step_2 --> Step_3"));
  });
});
