import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  hasVisibleTurnCard,
  hasScreenActionSuccess,
  hasVisibleTurnContent,
  INTERACTIVE_CARD_TOOLS,
} from "./yula-chat-turn-helpers.tsx";
import type { YulaToolPartInfo } from "@/lib/yula-tool-info";

describe("hasVisibleTurnCard & hasVisibleTurnContent", () => {
  it("INTERACTIVE_CARD_TOOLS ask_user_choice, ask_user_question ve suggest_next_steps içerir", () => {
    assert.ok(INTERACTIVE_CARD_TOOLS.has("ask_user_choice"));
    assert.ok(INTERACTIVE_CARD_TOOLS.has("ask_user_question"));
    assert.ok(INTERACTIVE_CARD_TOOLS.has("suggest_next_steps"));
  });

  it("ask_user_choice input-available veya output-available durumunda görünür kart sayılır", () => {
    const pendingChoice: YulaToolPartInfo[] = [
      {
        toolName: "ask_user_choice",
        state: "input-available",
        toolCallId: "call-1",
        input: { question: "Seçim yapın:", options: ["A", "B"] },
      },
    ];
    assert.equal(hasVisibleTurnCard(pendingChoice), true);
    assert.equal(
      hasVisibleTurnContent({ toolParts: pendingChoice, assistantText: "" }),
      true,
    );

    const answeredChoice: YulaToolPartInfo[] = [
      {
        toolName: "ask_user_choice",
        state: "output-available",
        toolCallId: "call-1",
        input: { question: "Seçim yapın:", options: ["A", "B"] },
        output: { choice: "A" },
      },
    ];
    assert.equal(hasVisibleTurnCard(answeredChoice), true);
    assert.equal(
      hasVisibleTurnContent({ toolParts: answeredChoice, assistantText: "" }),
      true,
    );
  });

  it("ask_user_question ve suggest_next_steps kartları görünür sayılır", () => {
    const questionTool: YulaToolPartInfo[] = [
      {
        toolName: "ask_user_question",
        state: "input-available",
        toolCallId: "call-q",
        input: { questions: [{ text: "Şirket nedir?" }] },
      },
    ];
    assert.equal(hasVisibleTurnCard(questionTool), true);
    assert.equal(
      hasVisibleTurnContent({ toolParts: questionTool, assistantText: "" }),
      true,
    );

    const suggestionTool: YulaToolPartInfo[] = [
      {
        toolName: "suggest_next_steps",
        state: "input-available",
        toolCallId: "call-s",
        input: { suggestions: ["Satış raporunu aç"] },
      },
    ];
    assert.equal(hasVisibleTurnCard(suggestionTool), true);
    assert.equal(
      hasVisibleTurnContent({ toolParts: suggestionTool, assistantText: "" }),
      true,
    );
  });

  it("visualize_grid_data grafiği output-available olduğunda görünür kart sayılır", () => {
    const chartTool: YulaToolPartInfo[] = [
      {
        toolName: "visualize_grid_data",
        state: "output-available",
        toolCallId: "call-c",
        output: { chartType: "bar", series: [] },
      },
    ];
    assert.equal(hasVisibleTurnCard(chartTool), true);
    assert.equal(
      hasVisibleTurnContent({ toolParts: chartTool, assistantText: "" }),
      true,
    );
  });

  it("dispatch_component_action ekran etkisi (SET_FIELDS vb.) hasScreenActionSuccess döner", () => {
    const setFieldsTool: YulaToolPartInfo[] = [
      {
        toolName: "dispatch_component_action",
        state: "output-available",
        toolCallId: "call-d",
        input: { component_id: "criteria_form:sales", action: "SET_FIELDS" },
        output: { status: "executed" },
      },
    ];
    assert.equal(hasScreenActionSuccess(setFieldsTool), true);
    assert.equal(
      hasVisibleTurnContent({ toolParts: setFieldsTool, assistantText: "" }),
      true,
    );
  });

  it("hiçbir metin, kart veya ekran eylemi yoksa hasVisibleTurnContent false döner (gerçek sessiz tur)", () => {
    const emptyTools: YulaToolPartInfo[] = [];
    assert.equal(
      hasVisibleTurnContent({ toolParts: emptyTools, assistantText: "" }),
      false,
    );
    assert.equal(
      hasVisibleTurnContent({ toolParts: emptyTools, assistantText: "   " }),
      false,
    );

    // Sadece salt-okuma veya iç araç çağrısı başarısızsa
    const failedReadTool: YulaToolPartInfo[] = [
      {
        toolName: "inspect_ui_state",
        state: "output-error",
        toolCallId: "call-err",
        errorText: "Failed to inspect",
      },
    ];
    assert.equal(
      hasVisibleTurnContent({ toolParts: failedReadTool, assistantText: "" }),
      false,
    );
  });

  it("asistan metni veya fallbackMessage varsa hasVisibleTurnContent true döner", () => {
    assert.equal(
      hasVisibleTurnContent({
        toolParts: [],
        assistantText: "Merhaba, size nasıl yardımcı olabilirim?",
      }),
      true,
    );

    assert.equal(
      hasVisibleTurnContent({
        toolParts: [],
        assistantText: "",
        fallbackMessage: { role: "assistant", parts: [{ type: "text", text: "Sonuçlar hazır." }] },
      }),
      true,
    );
  });
});
