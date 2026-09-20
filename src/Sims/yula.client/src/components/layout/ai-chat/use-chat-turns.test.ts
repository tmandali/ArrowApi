import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  computeDedupedMessages,
  computeChatTurns,
  computeStreamingPreview,
  computeRecoveredToolCallIds,
} from "./use-chat-turns";
import type { YulaMessage } from "@/app/api/agent/chat/route";

describe("use-chat-turns savunmacı yapı testleri", () => {
  it("parts alanı tanımsız (undefined) olan mesajlarda computeRecoveredToolCallIds çökmemelidir", () => {
    const brokenMessages = [
      { id: "m1", role: "user" } as unknown as YulaMessage,
      { id: "m2", role: "assistant" } as unknown as YulaMessage,
    ];

    const result = computeRecoveredToolCallIds(brokenMessages);
    assert.equal(result instanceof Set, true);
    assert.equal(result.size, 0);
  });

  it("parts alanı tanımsız (undefined) olan mesajlarda computeChatTurns çökmemelidir", () => {
    const brokenMessages = [
      { id: "m1", role: "user" } as unknown as YulaMessage,
      { id: "m2", role: "assistant" } as unknown as YulaMessage,
    ];

    const turns = computeChatTurns(brokenMessages);
    assert.equal(turns.length, 1);
    assert.equal(turns[0].id, "m1");
    assert.equal(turns[0].userMessage?.id, "m1");
    assert.equal(turns[0].assistantMessage?.id, "m2");
    assert.deepEqual(turns[0].assistantMessage?.parts, []);
  });

  it("parts alanı tanımsız (undefined) olan mesajlarda computeStreamingPreview çökmemelidir", () => {
    const brokenMessages = [
      { id: "m1", role: "assistant" } as unknown as YulaMessage,
    ];

    const preview = computeStreamingPreview(brokenMessages, "streaming");
    assert.equal(preview.streaming, true);
    assert.equal(preview.streamingThinking, "");
    assert.equal(preview.streamingContent, "");
  });

  it("aynı id'ye sahip mesajları computeDedupedMessages son kopyayı tutarak tekilleştirmelidir", () => {
    const dupeMessages = [
      { id: "m1", role: "user", parts: [{ type: "text", text: "İlk" }] } as unknown as YulaMessage,
      { id: "m1", role: "user", parts: [{ type: "text", text: "Güncel" }] } as unknown as YulaMessage,
    ];

    const deduped = computeDedupedMessages(dupeMessages);
    assert.equal(deduped.length, 1);
    const firstPart = (deduped[0].parts ?? [])[0] as { text: string } | undefined;
    assert.equal(firstPart?.text, "Güncel");
  });

  it("normal mesajlarda computeRecoveredToolCallIds ve computeChatTurns eksiksiz çalışmalıdır", () => {
    const messages = [
      {
        id: "m1",
        role: "user",
        parts: [{ type: "text", text: "Merhaba" }],
      } as unknown as YulaMessage,
      {
        id: "m2",
        role: "assistant",
        parts: [
          {
            type: "tool-call",
            toolName: "ask_user_choice",
            state: "input-available",
            toolCallId: "c1",
            args: { question: "Seçim yapın" },
          },
        ],
      } as unknown as YulaMessage,
    ];

    const turns = computeChatTurns(messages);
    assert.equal(turns.length, 1);
    assert.equal(turns[0].assistantMessages.length, 1);

    const recovered = computeRecoveredToolCallIds(messages);
    assert.equal(recovered instanceof Set, true);
  });
});
