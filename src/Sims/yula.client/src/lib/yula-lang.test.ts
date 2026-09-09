/**
 * Node built-in test runner: npx tsx --test src/lib/yula-lang.test.ts
 * UI dili sezgisi (saf).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { detectUserLanguage, pickLang } from "./yula-lang.ts";

describe("detectUserLanguage", () => {
  it("detects Turkish by special chars", () => {
    assert.equal(detectUserLanguage("Şirket kodu nedir?"), "tr");
    assert.equal(detectUserLanguage("raporu çalıştır"), "tr");
  });
  it("detects English by common words", () => {
    assert.equal(detectUserLanguage("run the report"), "en");
    assert.equal(detectUserLanguage("What is the total?"), "en");
  });
  it("defaults to tr on empty or ambiguous input", () => {
    assert.equal(detectUserLanguage(""), "tr");
    assert.equal(detectUserLanguage("12345"), "tr");
    assert.equal(detectUserLanguage(undefined), "tr");
  });
});

describe("pickLang", () => {
  it("selects by language", () => {
    assert.equal(pickLang("tr", "merhaba", "hello"), "merhaba");
    assert.equal(pickLang("en", "merhaba", "hello"), "hello");
  });
});
