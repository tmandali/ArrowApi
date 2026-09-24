import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeHitlPrompt } from "./hitl-prompt";

describe("normalizeHitlPrompt contract", () => {
  it("normalizes request_user_confirmation with default CLI-style numbered options", () => {
    const prompt = normalizeHitlPrompt({
      toolName: "request_user_confirmation",
      toolCallId: "call-1",
      input: {
        title: "Allow checking listening ports and processes?",
        command: "Get-NetTCPConnection -State Listen | Select-Object -First 10",
      },
    });

    assert.ok(prompt);
    assert.equal(prompt.toolCallId, "call-1");
    assert.equal(prompt.title, "Allow checking listening ports and processes?");
    assert.equal(
      prompt.codeSnippet,
      "Get-NetTCPConnection -State Listen | Select-Object -First 10",
    );
    assert.equal(prompt.options.length, 3);
    assert.equal(prompt.options[0]?.label, "Yes");
    assert.equal(prompt.options[0]?.shortcutKey, "1");
    assert.equal(prompt.options[1]?.label, "No");
    assert.equal(prompt.options[1]?.shortcutKey, "2");
    assert.equal(prompt.options[2]?.isCustomInput, true);
    assert.equal(prompt.options[2]?.shortcutKey, "3");
    assert.equal(prompt.allowSkip, true);
  });

  it("normalizes ask_user_choice with 1-9 numbered shortcuts and custom input", () => {
    const prompt = normalizeHitlPrompt({
      toolName: "ask_user_choice",
      toolCallId: "call-2",
      input: {
        question: "Hangi depoyu seçmek istersiniz?",
        options: [
          { label: "Merkez Depo", value: "TJ01", description: "Ana Lojistik" },
          { label: "Şube Depo", value: "TJ02", description: "Bölge Dağıtım" },
        ],
        allow_custom: true,
        custom_placeholder: "Örn: TJ03 veya farklı bir kod…",
      },
    });

    assert.ok(prompt);
    assert.equal(prompt.title, "Hangi depoyu seçmek istersiniz?");
    assert.equal(prompt.options.length, 3); // 2 options + 1 custom
    assert.equal(prompt.options[0]?.shortcutKey, "1");
    assert.equal(prompt.options[0]?.label, "Merkez Depo");
    assert.equal(prompt.options[0]?.value, "TJ01");
    assert.equal(prompt.options[1]?.shortcutKey, "2");
    assert.equal(prompt.options[2]?.isCustomInput, true);
    assert.equal(prompt.options[2]?.shortcutKey, "3");
    assert.equal(prompt.customPlaceholder, "Örn: TJ03 veya farklı bir kod…");
  });

  it("returns null for empty or invalid inputs", () => {
    assert.equal(
      normalizeHitlPrompt({ toolCallId: "call-err", input: null }),
      null,
    );
    assert.equal(
      normalizeHitlPrompt({ toolCallId: "call-err", input: undefined }),
      null,
    );
  });

  it("correctly identifies unresolved suspend: true output as pending (isHitlResolved === false)", () => {
    const suspendedOutput = {
      content: [{ type: "text", text: "[User Decision Required]: Şirket kodunu seçin:" }],
      details: {
        question: "Şirket kodunu seçin:",
        options: [
          { label: "TJ01", value: "TJ01", description: "Perakende raporu TJ01" },
          { label: "TJ02", value: "TJ02", description: "Perakende raporu TJ02" },
        ],
        allow_custom: false,
      },
      suspend: true,
      terminate: false,
    };

    const prompt = normalizeHitlPrompt({
      toolName: "ask_user_choice",
      toolCallId: "call-live-1",
      input: {
        question: "Şirket kodunu seçin:",
        options: [
          { label: "TJ01", value: "TJ01", description: "Perakende raporu TJ01" },
          { label: "TJ02", value: "TJ02", description: "Perakende raporu TJ02" },
        ],
        allow_custom: false,
      },
      output: suspendedOutput,
    });

    assert.ok(prompt);
    assert.equal(prompt.title, "Şirket kodunu seçin:");
    assert.equal(prompt.options.length, 2); // allow_custom is false, so exactly 2 options
    assert.equal(prompt.options[0]?.shortcutKey, "1");
    assert.equal(prompt.options[0]?.label, "TJ01");
    assert.equal(prompt.options[1]?.shortcutKey, "2");
    assert.equal(prompt.options[1]?.label, "TJ02");
  });
});
