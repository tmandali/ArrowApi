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
