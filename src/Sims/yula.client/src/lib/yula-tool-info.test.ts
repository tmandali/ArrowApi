/**
 * Node built-in test runner:
 *   npx tsx --test src/lib/yula-tool-info.test.ts
 * Aynı-adım yinelenen soru guard'ı: adım başına ilk ask yaşar.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEDUPE_SKIP_MARKER,
  findDuplicateQuestionCallIds,
  isDedupeSkipOutput,
} from "./yula-tool-info.ts";

function askPart(toolCallId: string, state = "input-available") {
  return {
    type: "tool-ask_user_question",
    toolCallId,
    state,
    input: { questions: [{ id: "q", prompt: "Soru?", choices: [] }] },
  };
}

function choicePart(toolCallId: string, state = "input-available") {
  return {
    type: "tool-ask_user_choice",
    toolCallId,
    state,
    input: { question: "Soru?", options: ["A", "B"] },
  };
}

function otherPart(toolCallId: string, name = "run_job") {
  return { type: `tool-${name}`, toolCallId, state: "input-available", input: {} };
}

function stepStart() {
  return { type: "step-start" };
}

describe("findDuplicateQuestionCallIds", () => {
  it("aynı adımdaki ikinci soruyu yinelenen sayar", () => {
    const out = findDuplicateQuestionCallIds([
      { role: "assistant", parts: [askPart("a1"), askPart("a2")] },
    ]);
    assert.deepEqual([...out], ["a2"]);
  });

  it("üç soruda ilk yaşar, diğer ikisi elenir", () => {
    const out = findDuplicateQuestionCallIds([
      { role: "assistant", parts: [askPart("a1"), askPart("a2"), askPart("a3")] },
    ]);
    assert.deepEqual([...out].sort(), ["a2", "a3"]);
  });

  it("tek soru elenmez", () => {
    const out = findDuplicateQuestionCallIds([
      { role: "assistant", parts: [askPart("a1")] },
    ]);
    assert.equal(out.size, 0);
  });

  it("aynı adımdaki ikinci ask_user_choice çağrısını yinelenen sayar", () => {
    const out = findDuplicateQuestionCallIds([
      { role: "assistant", parts: [choicePart("c1"), choicePart("c2")] },
    ]);
    assert.deepEqual([...out], ["c2"]);
  });

  it("farklı adımdaki sorular elenmez (step-start sınırı)", () => {
    const out = findDuplicateQuestionCallIds([
      {
        role: "assistant",
        parts: [askPart("a1"), stepStart(), askPart("a2")],
      },
    ]);
    assert.equal(out.size, 0);
  });

  it("farklı mesajlardaki sorular elenmez (cevap sonrası devam sorusu)", () => {
    const out = findDuplicateQuestionCallIds([
      { role: "assistant", parts: [askPart("a1")] },
      { role: "user", parts: [{ type: "text", text: "x" }] },
      { role: "assistant", parts: [askPart("a2")] },
    ]);
    assert.equal(out.size, 0);
  });

  it("tamamlanmış ilk sorudan sonra aynı adıma gelen ikinci soru elenir", () => {
    const out = findDuplicateQuestionCallIds([
      {
        role: "assistant",
        parts: [askPart("a1", "output-available"), askPart("a2")],
      },
    ]);
    assert.deepEqual([...out], ["a2"]);
  });

  it("soru olmayan araçların tekrarına dokunmaz", () => {
    const out = findDuplicateQuestionCallIds([
      { role: "assistant", parts: [otherPart("j1"), otherPart("j2")] },
    ]);
    assert.equal(out.size, 0);
  });

  it("kullanıcı mesajları ve boş gövdeler güvenlidir", () => {
    const out = findDuplicateQuestionCallIds([
      { role: "user", parts: [askPart("a1")] },
      { role: "assistant" },
      { role: "assistant", parts: [] },
    ]);
    assert.equal(out.size, 0);
  });
});

describe("isDedupeSkipOutput", () => {
  it("işaret önekini yakalar", () => {
    assert.equal(
      isDedupeSkipOutput({
        toolName: "ask_user_question",
        state: "output-error",
        toolCallId: "x",
        errorText: `${DEDUPE_SKIP_MARKER} (ek bilgi)`,
      }),
      true,
    );
  });

  it("gerçek hatayı dedupe saymaz", () => {
    assert.equal(
      isDedupeSkipOutput({
        toolName: "ask_user_question",
        state: "output-error",
        toolCallId: "x",
        errorText: "Binder Error: tablo yok",
      }),
      false,
    );
    assert.equal(
      isDedupeSkipOutput({
        toolName: "run_job",
        state: "output-available",
        toolCallId: "x",
      }),
      false,
    );
  });
});

describe("extractToolErrorMessage & isFailedToolInfo type-safe guards", () => {
  it("başarılı details.message alanını hata olarak algılamaz (false-positive önleme)", async () => {
    const { extractToolErrorMessage, isFailedToolInfo } = await import("./yula-tool-info.ts");
    const successOutput = {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            status: "ok",
            message: 'Grid view updated to "Retail Sales Report" (519 rows).',
          }),
        },
      ],
      details: {
        status: "ok",
        sql: "SELECT ...",
        message: 'Grid view updated to "Retail Sales Report" (519 rows).',
      },
    };

    assert.equal(extractToolErrorMessage(successOutput), null);
    assert.equal(
      isFailedToolInfo({
        toolCallId: "c1",
        toolName: "dispatch_component_action",
        state: "output-available",
        output: successOutput,
      }),
      false,
    );
  });

  it("gerçek hata detaylarını (status: error veya error alanı) doğru şekilde ayıklar", async () => {
    const { extractToolErrorMessage, isFailedToolInfo } = await import("./yula-tool-info.ts");
    const errorOutput = {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            status: "error",
            error: "Invalid category column: ",
          }),
        },
      ],
      details: {
        status: "error",
        error: "Invalid category column: ",
      },
    };

    assert.equal(extractToolErrorMessage(errorOutput), "Invalid category column: ");
    assert.equal(
      isFailedToolInfo({
        toolCallId: "c2",
        toolName: "dispatch_component_action",
        state: "output-available",
        output: errorOutput,
      }),
      true,
    );
  });
});

describe("isCanonicalToolPart & isKnownToolName type guards", () => {
  it("validates canonical tool parts correctly", async () => {
    const { isCanonicalToolPart, yulaToolPartInfo } = await import("./yula-tool-info.ts");

    assert.equal(
      isCanonicalToolPart({ tool: "ask_user_choice", input: { question: "Q" } }),
      true,
    );
    assert.equal(isCanonicalToolPart({ tool: "dispatch_component_action" }), true);
    assert.equal(isCanonicalToolPart({ tool: "" }), false);
    assert.equal(isCanonicalToolPart({ notTool: true }), false);
    assert.equal(isCanonicalToolPart(null), false);
    assert.equal(isCanonicalToolPart(undefined), false);

    const info = yulaToolPartInfo({
      tool: "ask_user_choice",
      toolCallId: "tc_123",
      input: { question: "Tamam mı?" },
      output: { selected: "Evet" },
    });
    assert.ok(info);
    assert.equal(info?.toolName, "ask_user_choice");
    assert.equal(info?.state, "output-available");
    assert.equal(info?.toolCallId, "tc_123");
  });

  it("identifies known and unknown tool names", async () => {
    const { isKnownToolName } = await import("./yula-tool-info.ts");

    assert.equal(isKnownToolName("dispatch_component_action"), true);
    assert.equal(isKnownToolName("ask_user_choice"), true);
    assert.equal(isKnownToolName("visualize_grid_data"), true);
    assert.equal(isKnownToolName("custom_unknown_tool"), false);
    assert.equal(isKnownToolName(null), false);
    assert.equal(isKnownToolName(123), false);
  });
});

describe("isResultGridComponentId & isResultGridComponent type guards", () => {
  it("identifies valid and invalid result grid component IDs", async () => {
    const { isResultGridComponentId, RESULT_GRID_COMPONENT_ID } = await import("./yula-tool-info.ts");

    assert.equal(isResultGridComponentId(RESULT_GRID_COMPONENT_ID), true);
    assert.equal(isResultGridComponentId("result_grid:active"), true);
    assert.equal(isResultGridComponentId("result_grid:custom"), true);
    assert.equal(isResultGridComponentId("result_grid"), true);
    assert.equal(isResultGridComponentId("criteria_form:sales"), false);
    assert.equal(isResultGridComponentId("app_router"), false);
    assert.equal(isResultGridComponentId(null), false);
    assert.equal(isResultGridComponentId(123), false);
  });

  it("identifies components with result grid ID", async () => {
    const { isResultGridComponent } = await import("./yula-tool-info.ts");

    assert.equal(isResultGridComponent({ id: "result_grid:active" }), true);
    assert.equal(isResultGridComponent({ id: "result_grid:view_1" }), true);
    assert.equal(isResultGridComponent({ id: "job_history" }), false);
    assert.equal(isResultGridComponent(null), false);
    assert.equal(isResultGridComponent({}), false);
  });
});


