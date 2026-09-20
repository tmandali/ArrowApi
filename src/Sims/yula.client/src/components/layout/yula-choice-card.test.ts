import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseChoiceData } from "./yula-choice-card.tsx";

describe("YulaChoiceCard dynamic custom_placeholder and choice parsing", () => {
  it("resolves dynamic custom_placeholder hint from model", () => {
    const data = parseChoiceData({
      question: "Which date range would you like to inspect?",
      options: ["Last 7 days", "Last 30 days", "This month"],
      allow_custom: true,
      custom_placeholder: "E.g.: 2026-09-01..2026-09-15 or type custom date…",
    });

    assert.ok(data);
    assert.equal(data.question, "Which date range would you like to inspect?");
    assert.equal(data.options.length, 3);
    assert.equal(data.allowCustom, true);
    assert.equal(data.customPlaceholder, "E.g.: 2026-09-01..2026-09-15 or type custom date…");
  });

  it("preserves multilingual (EN/RU/TR) dynamic content without hardcoded language constraints", () => {
    const dataEn = parseChoiceData({
      question: "Which date range would you like to inspect?",
      options: ["Last 7 days", "This month"],
      allow_custom: true,
      custom_placeholder: "E.g.: 2026-09-01..2026-09-15 or type a date…",
    });
    assert.ok(dataEn);
    assert.equal(dataEn.customPlaceholder, "E.g.: 2026-09-01..2026-09-15 or type a date…");

    const dataRu = parseChoiceData({
      question: "Какой диапазон дат вы хотите проверить?",
      options: ["Последние 7 дней", "Этот месяц"],
      allow_custom: true,
      custom_placeholder: "Например: 2026-09-01..2026-09-15…",
    });
    assert.ok(dataRu);
    assert.equal(dataRu.customPlaceholder, "Например: 2026-09-01..2026-09-15…");

    const dataTr = parseChoiceData({
      question: "Hangi tarih aralığını incelemek istersiniz?",
      options: ["Son 7 gün", "Bu ay"],
      allow_custom: true,
      custom_placeholder: "Örn: 2026-09-01..2026-09-15…",
    });
    assert.ok(dataTr);
    assert.equal(dataTr.customPlaceholder, "Örn: 2026-09-01..2026-09-15…");
  });

  it("returns undefined when custom_placeholder is omitted, allowing UI i18n fallback", () => {
    const data = parseChoiceData({
      question: "Select company code:",
      options: [
        { label: "TJ01", value: "TJ01", description: "Main Store" },
        { label: "TJ02", value: "TJ02", description: "Secondary Store" },
      ],
      allow_custom: true,
    });

    assert.ok(data);
    assert.equal(data.customPlaceholder, undefined);
    assert.equal(data.options[0].label, "TJ01");
    assert.equal(data.options[0].description, "Main Store");
  });

  it("honors allow_custom: false to disable free-form input", () => {
    const data = parseChoiceData({
      question: "Do you confirm?",
      options: ["Yes", "No"],
      allow_custom: false,
    });

    assert.ok(data);
    assert.equal(data.allowCustom, false);
  });

  it("extracts question and options from output.details when input is empty or undefined", () => {
    const outputWithDetails = {
      content: [
        {
          type: "text",
          text: "[User Decision Required]: What would you like to do?\nOptions: [\"Run report\",\"Fill criteria\",\"Open results\"]",
        },
      ],
      details: {
        question: "What would you like to do?",
        options: ["Run report", "Fill criteria", "Open results"],
        allow_custom: false,
        custom_placeholder: "",
      },
      terminate: true,
    };

    const data = parseChoiceData(undefined, outputWithDetails);
    assert.ok(data);
    assert.equal(data.question, "What would you like to do?");
    assert.equal(data.options.length, 3);
    assert.equal(data.options[0].label, "Run report");
    assert.equal(data.options[1].label, "Fill criteria");
    assert.equal(data.options[2].label, "Open results");
    assert.equal(data.allowCustom, false);
  });

  it("does not swallow output.details when input is an empty object {}", () => {
    const output = {
      details: {
        question: "Select target warehouse:",
        options: ["Central", "Regional"],
        allow_custom: true,
      },
    };

    const data = parseChoiceData({}, output);
    assert.ok(data);
    assert.equal(data.question, "Select target warehouse:");
    assert.equal(data.options.length, 2);
    assert.equal(data.options[0].label, "Central");
  });

  it("falls back to parsing content text regex when details object is missing", () => {
    const output = {
      content: [
        {
          type: "text",
          text: "[User Decision Required]: Choose an action\nOptions: [\"Option A\",\"Option B\"]",
        },
      ],
    };

    const data = parseChoiceData(undefined, output);
    assert.ok(data);
    assert.equal(data.question, "Choose an action");
    assert.equal(data.options.length, 2);
    assert.equal(data.options[0].label, "Option A");
    assert.equal(data.options[1].label, "Option B");
  });
});
