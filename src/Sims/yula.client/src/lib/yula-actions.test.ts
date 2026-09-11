/**
 * Node built-in test runner:
 *   npx tsx --test src/lib/yula-actions.test.ts
 * Run-onay dedektörü: kriter ekranındaki çalıştır önerisi butona bağlanır.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  criteriaStaticTitles,
  isRunConfirmPhrase,
  runConfirmationClickPrompt,
} from "./yula-actions.ts";

describe("criteriaStaticTitles", () => {
  it("perakende satış kriter başlıklarını küçük harfle döner", () => {
    const titles = criteriaStaticTitles("/stock/retail-sales-report");
    assert.ok(titles.includes("hareket tarihi"), "title olmalı");
    assert.ok(titles.includes("şirket kodu"), "title olmalı");
    assert.ok(titles.includes("harekettarihi") || titles.includes("hareketTarihi".toLowerCase()), "key olmalı");
  });

  it("rapor-dışı yolda boş döner", () => {
    assert.deepEqual(criteriaStaticTitles("/system/agents"), []);
    assert.deepEqual(criteriaStaticTitles("/"), []);
  });
});

describe("isRunConfirmPhrase", () => {
  it("TR/EN onay kalıplarını yakalar", () => {
    assert.equal(isRunConfirmPhrase("• **Raporu çalıştır** — onaylayın"), true);
    assert.equal(isRunConfirmPhrase("• **Run the report** — confirm"), true);
    assert.equal(isRunConfirmPhrase("Raporu çalıştırın"), true);
  });

  it("sıradan metni yakalamaz", () => {
    assert.equal(isRunConfirmPhrase("Kriterler eksik: Tarih girin."), false);
    assert.equal(isRunConfirmPhrase(""), false);
    assert.equal(isRunConfirmPhrase(null), false);
  });
});

const CRITERIA_PATH = "/stock/retail-sales-report";

describe("runConfirmationClickPrompt", () => {
  it("TR onayında Türkçe run mesajı + scope döner", () => {
    assert.deepEqual(
      runConfirmationClickPrompt({
        text: "Form dolduruldu. • **Raporu çalıştır** — onaylayın.",
        pathname: CRITERIA_PATH,
        lang: "tr",
        hasExecutedRun: false,
      }),
      { prompt: "Raporu çalıştır", scope: "retail-sales-report" },
    );
  });

  it("EN onayında İngilizce run mesajı + scope döner", () => {
    assert.deepEqual(
      runConfirmationClickPrompt({
        text: "Criteria ready. • **Run the report** — confirm to proceed.",
        pathname: CRITERIA_PATH,
        lang: "en",
        hasExecutedRun: false,
      }),
      { prompt: "Run the report", scope: "retail-sales-report" },
    );
  });

  it("onay cümlesi yoksa null döner", () => {
    assert.equal(
      runConfirmationClickPrompt({
        text: "Kriterler eksik: Hareket Tarihi girilmelidir.",
        pathname: CRITERIA_PATH,
        lang: "tr",
        hasExecutedRun: false,
      }),
      null,
    );
  });

  it("iş zaten koştuysa null döner (çift çalıştırma yok)", () => {
    assert.equal(
      runConfirmationClickPrompt({
        text: "• **Run the report**",
        pathname: CRITERIA_PATH,
        lang: "en",
        hasExecutedRun: true,
      }),
      null,
    );
    assert.equal(
      runConfirmationClickPrompt({
        text: "📊 Perakende Satış Raporu Başlatıldı",
        pathname: CRITERIA_PATH,
        lang: "tr",
        hasExecutedRun: false,
      }),
      null,
    );
  });

  it("sonuç ekranında ve rapor-dışı sayfada null döner", () => {
    assert.equal(
      runConfirmationClickPrompt({
        text: "• **Raporu çalıştır**",
        pathname: `${CRITERIA_PATH}?jobId=123e4567-e89b-12d3-a456-426614174000`,
        lang: "tr",
        hasExecutedRun: false,
      }),
      null,
    );
    assert.equal(
      runConfirmationClickPrompt({
        text: "• **Raporu çalıştır**",
        pathname: "/system/agents",
        lang: "tr",
        hasExecutedRun: false,
      }),
      null,
    );
  });
});
