import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  resolveActiveToolsForStep,
  prepareStepRouting,
  estimateStepTokens,
} from "./yula-step-router";

describe("yula-step-router", () => {
  const allTools = [
    "dispatch_component_action",
    "inspect_ui_state",
    "ask_user_choice",
    "remember_fact",
    "recall_fact",
    "query_playbook",
    "propose_playbook_update",
  ];

  it("görsel içeren mesajlarda aktif araçları boş döner", () => {
    const tools = resolveActiveToolsForStep({
      stepNumber: 1,
      toolNames: allTools,
      hasImageInMessages: true,
      messages: [{ role: "user", content: "Bu ekran görüntüsünü incele" }],
    });
    assert.deepEqual(tools, []);
  });

  it("normal akışta tüm standart araçları korur", () => {
    const tools = resolveActiveToolsForStep({
      phase: "workspace",
      stepNumber: 1,
      toolNames: allTools,
      hasImageInMessages: false,
      messages: [{ role: "user", content: "Satış raporunu aç" }],
    });
    assert.deepEqual(tools, allTools);
  });

  it("bütçe altındayken mesajları budamaz", () => {
    const res = prepareStepRouting({
      phase: "workspace",
      stepNumber: 1,
      toolNames: allTools,
      hasImageInMessages: false,
      messages: [{ role: "user", content: "Kısa mesaj" }],
      compactionBudget: 10_000,
    });
    assert.deepEqual(res.activeTools, allTools);
    assert.equal(res.compactedMessages, undefined);
  });

  it("token büyüklüğünü doğru hesaplar", () => {
    const tok = estimateStepTokens([{ role: "user", content: "Test" }]);
    assert.ok(tok > 0);
  });
});
