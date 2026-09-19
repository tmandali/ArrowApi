import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseChoiceData } from "./yula-choice-card.tsx";

describe("YulaChoiceCard dynamic custom_placeholder and choice parsing", () => {
  it("modelin dinamik ürettiği custom_placeholder alanını başarıyla çözer", () => {
    const data = parseChoiceData({
      question: "Hangi tarih aralığını incelemek istersiniz?",
      options: ["Son 7 gün", "Son 30 gün", "Bu ay"],
      allow_custom: true,
      custom_placeholder: "Örn: 2026-09-01..2026-09-15 veya özel tarih yazın…",
    });

    assert.ok(data);
    assert.equal(data.question, "Hangi tarih aralığını incelemek istersiniz?");
    assert.equal(data.options.length, 3);
    assert.equal(data.allowCustom, true);
    assert.equal(data.customPlaceholder, "Örn: 2026-09-01..2026-09-15 veya özel tarih yazın…");
  });

  it("çok dilli (EN/RU/TR) custom_placeholder desteğini korur", () => {
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
  });

  it("custom_placeholder verilmediğinde undefined döner, UI varsayılan i18n metnine düşer", () => {
    const data = parseChoiceData({
      question: "Şirket kodu seçin:",
      options: [
        { label: "TJ01", value: "TJ01", description: "Ana Mağazacılık" },
        { label: "TJ02", value: "TJ02", description: "İkinci Mağazacılık" },
      ],
      allow_custom: true,
    });

    assert.ok(data);
    assert.equal(data.customPlaceholder, undefined);
    assert.equal(data.options[0].label, "TJ01");
    assert.equal(data.options[0].description, "Ana Mağazacılık");
  });

  it("allow_custom: false olduğunda custom girişi kapatır", () => {
    const data = parseChoiceData({
      question: "Onaylıyor musunuz?",
      options: ["Evet", "Hayır"],
      allow_custom: false,
    });

    assert.ok(data);
    assert.equal(data.allowCustom, false);
  });
});
