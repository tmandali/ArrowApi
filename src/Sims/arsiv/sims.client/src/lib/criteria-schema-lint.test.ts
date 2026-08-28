import { describe, expect, it } from "vitest";

/**
 * Tak-Çalıştır rapor şeması lint'i: her `*-criteria.schema.json` dosyası
 * AI sözleşmesinin minimum verisini TAŞIMAK ZORUNDADIR. Yeni rapor eklendiğinde
 * alias/quick-prompt kalitesi burada korunur ("açıklamalar zayıf" sorununun
 * kalıcı güvencesi).
 *
 * Sert kurallar (test KIRILIR):
 *  - x-ai bloğu + en az 3 alias
 *  - en az 2 quickPrompt
 *  - title/description dolu
 * Yumuşak kural (yalnız UYARI): x-ai.columnAliases — grid kolonları bilinen
 * raporlar için önerilir. Kolonları iş anında hesaplanan raporlar (örn. analitik)
 * bunu bilinçli olarak taşımaz; o durumda `x-ai.dynamicColumns: true` ile
 * işaretlenir ve uyarı bastırılır.
 */

const schemas = import.meta.glob("/src/features/**/*-criteria.schema.json", {
  eager: true,
}) as Record<string, { default: Record<string, any> }>;

function aiBlock(schema: Record<string, any>): Record<string, any> {
  const ai = schema["x-ai"];
  return ai && typeof ai === "object" && !Array.isArray(ai) ? ai : {};
}

describe("criteria.schema.json AI sözleşmesi", () => {
  it("en az bir rapor şeması bulunur (glob boş dönmez)", () => {
    expect(Object.keys(schemas).length).toBeGreaterThan(0);
  });

  it.each(Object.entries(schemas))(
    "%s minimum AI meta verisini taşır",
    (path, mod) => {
      const schema = mod.default;
      const ai = aiBlock(schema);

      const aliases = Array.isArray(ai.aliases) ? ai.aliases.filter(Boolean) : [];
      expect(aliases.length, `${path}: x-ai.aliases en az 3 olmalı`).toBeGreaterThanOrEqual(3);

      const prompts = Array.isArray(ai.quickPrompts) ? ai.quickPrompts.filter(Boolean) : [];
      expect(prompts.length, `${path}: x-ai.quickPrompts en az 2 olmalı`).toBeGreaterThanOrEqual(2);

      expect(String(schema.title || "").trim(), `${path}: title dolu olmalı`).not.toBe("");
      expect(
        String(schema.description || "").trim(),
        `${path}: description dolu olmalı`
      ).not.toBe("");

      const columnAliases = ai.columnAliases as Record<string, unknown> | undefined;
      if (!columnAliases || Object.keys(columnAliases).length === 0) {
        if (ai.dynamicColumns === true) return; // Dinamik kolonlu rapor: bilinçli boşluk
        console.warn(
          `[Schema Lint] ${path}: x-ai.columnAliases yok — grid kolonu sabit olan raporlarda önerilir ` +
            `(kolonlar iş anında hesaplanıyorsa x-ai.dynamicColumns: true ile işaretleyin).`
        );
      }
    }
  );
});
