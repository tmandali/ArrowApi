import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { convertToModelMessages } from "ai";
import {
  normalizeUIMessagesForTransport,
  slimMessagesForTransport,
} from "./context-slim";

describe("context-slim & message normalization testleri", () => {
  it("parts alanı olmayan mesajları parts içeren geçerli UIMessage formatına dönüştürmelidir", () => {
    const raw = [
      { role: "user", content: "merhaba" },
      { role: "assistant", content: "nasıl yardımcı olabilirim?" },
    ];

    const normalized = normalizeUIMessagesForTransport(raw);
    assert.equal(normalized.length, 2);
    assert.equal(Array.isArray(normalized[0].parts), true);
    assert.equal(Array.isArray(normalized[1].parts), true);
    assert.deepEqual(normalized[0].parts, [{ type: "text", text: "merhaba" }]);
  });

  it("AI SDK convertToModelMessages, normalize edilmiş mesajlarda 'reading some' hatası vermemelidir", async () => {
    const brokenRaw = [
      { role: "user", content: "raporu aç" },
      { role: "assistant", parts: undefined },
    ];

    const safeMessages = normalizeUIMessagesForTransport(brokenRaw);
    const modelMessages = await convertToModelMessages(
      slimMessagesForTransport(safeMessages) as any,
    );

    assert.equal(Array.isArray(modelMessages), true);
    assert.equal(modelMessages.length >= 1, true);
  });

  it("zaten geçerli parts dizisine sahip mesajları olduğu gibi korumalıdır", () => {
    const valid = [
      {
        id: "m1",
        role: "user",
        parts: [{ type: "text", text: "test" }],
      },
    ];

    const normalized = normalizeUIMessagesForTransport(valid);
    assert.equal(normalized.length, 1);
    assert.deepEqual(normalized[0].parts, [{ type: "text", text: "test" }]);
  });

  it("Pi agentLoop'tan gelen role: 'toolResult' mesajını asistan parçasına katlamalı ve convertToModelMessages 'Unsupported role' hatası vermemelidir", async () => {
    const piLoopMessages = [
      { id: "msg-1", role: "user", content: "Stok durumunu getir" },
      {
        id: "msg-2",
        role: "assistant",
        parts: [
          {
            type: "tool-dispatch_component_action",
            toolCallId: "call-xyz",
            toolName: "dispatch_component_action",
            args: { targetComponent: "criteria_form" },
          },
        ],
      },
      {
        role: "toolResult",
        toolCallId: "call-xyz",
        toolName: "dispatch_component_action",
        content: [{ type: "text", text: '{"status":"ok"}' }],
        output: { status: "ok" },
      },
    ];

    const normalized = normalizeUIMessagesForTransport(piLoopMessages as any);

    // toolResult mesajı bağımsız bir mesaj olarak kalmamalı, asistan parçasına katlanmalıdır
    assert.equal(normalized.some((m) => (m as any).role === "toolResult"), false);
    assert.equal(normalized.length, 2);

    const asstMsg = normalized[1];
    assert.equal(asstMsg.role, "assistant");
    const toolPart = (asstMsg.parts as any[])?.find((p) => p.toolCallId === "call-xyz");
    assert.ok(toolPart);
    assert.equal(toolPart.state, "output-available");
    assert.deepEqual(toolPart.output, { status: "ok" });

    // AI SDK'nın convertToModelMessages fonksiyonu Unsupported role hatası fırlatmamalıdır
    const modelMessages = await convertToModelMessages(
      slimMessagesForTransport(normalized) as any,
    );
    assert.ok(Array.isArray(modelMessages));
    assert.equal(modelMessages.length, 3); // user + assistant(tool-call) + tool(tool-result)
  });

  it("ask_user_choice çağrısını takip eden kullanıcı seçimiyle eşleştirip MissingToolResultsError hatasını engellemelidir", async () => {
    const chatHistory = [
      {
        role: "user",
        parts: [{ type: "text", text: "Haftalık stok sayım mutabakatını kontrol et." }],
      },
      {
        role: "assistant",
        parts: [
          { type: "text", text: "Plan hazır:" },
          {
            type: "tool-ask_user_choice",
            toolCallId: "tc_choice_99",
            toolName: "ask_user_choice",
            input: {
              question: "Mutabakat kontrolü için iş akışını nasıl başlatayım?",
              options: [
                { label: "Planı Başlat ve İcra Et", value: "start_current_week" },
                { label: "Geçen Tamamlanan Haftayı Kontrol Et", value: "start_previous_week" },
              ],
            },
            state: "call",
          },
        ],
      },
      {
        role: "user",
        parts: [{ type: "text", text: "Geçen Tamamlanan Haftayı Kontrol Et (start_previous_week)" }],
      },
    ];

    const normalized = normalizeUIMessagesForTransport(chatHistory as any);
    const asstMsg = normalized[1];
    const choicePart = (asstMsg.parts as any[])?.find((p) => p.toolCallId === "tc_choice_99");

    assert.ok(choicePart, "ask_user_choice parçası bulunmalıdır");
    assert.equal(choicePart.state, "output-available");
    assert.equal(choicePart.output?.selected, "Geçen Tamamlanan Haftayı Kontrol Et");
    assert.equal(choicePart.output?.value, "start_previous_week");

    // convertToModelMessages hatasız çalışmalı ve tool mesajı üretmelidir
    const modelMessages = await convertToModelMessages(
      slimMessagesForTransport(normalized) as any,
      { ignoreIncompleteToolCalls: true },
    );
    assert.equal(modelMessages.length, 4); // user + assistant + tool + user
    assert.equal(modelMessages[2].role, "tool");
  });

  it("herhangi bir açıkta kalan state: call aracı slimMessagesForTransport güvenle sonuçlandırmalıdır", async () => {
    const raw = [
      {
        role: "assistant",
        parts: [
          {
            type: "tool-dispatch_component_action",
            toolCallId: "tc_raw_call",
            toolName: "dispatch_component_action",
            input: { action: "SET_FIELDS" },
            state: "call",
          },
        ],
      },
    ];

    const slimmed = slimMessagesForTransport(normalizeUIMessagesForTransport(raw as any));
    const toolPart = (slimmed[0].parts as any[])[0];
    assert.ok(
      toolPart.state === "output-available" || toolPart.state === "output-error",
      "Durum güvenli bir çıktı durumuna geçmelidir",
    );

    const modelMessages = await convertToModelMessages(slimmed as any, {
      ignoreIncompleteToolCalls: true,
    });
    assert.ok(Array.isArray(modelMessages));
  });
});
