import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  inferCriteriaFieldFromQuestion,
  isQuestionText,
  isBulletBlock,
  normalizeChoiceBullets,
} from "@/lib/yula-choice-inference";
import { renderPlainBullet } from "@/components/layout/chat-markdown/markdown-blocks";
import { uiEventBus } from "@my-agent/core";

describe("🎯 Yula Choice Bullet & Event Bus HITL Test", () => {
  it("inferCriteriaFieldFromQuestion should extract correct field name from Turkish/English questions", () => {
    assert.equal(
      inferCriteriaFieldFromQuestion("Hangi şirket koduyla devam edelim?"),
      "CompanyCode",
    );
    assert.equal(
      inferCriteriaFieldFromQuestion("Which company code should we use?"),
      "CompanyCode",
    );
    assert.equal(
      inferCriteriaFieldFromQuestion("Hangi depo için filtre uygulansın?"),
      "WarehouseCode",
    );
    assert.equal(
      inferCriteriaFieldFromQuestion("Hangi mağaza filtresi?"),
      "StoreCode",
    );
    assert.equal(
      inferCriteriaFieldFromQuestion("Hangi tarih aralığı seçilsin?"),
      "Date",
    );
    assert.equal(
      inferCriteriaFieldFromQuestion("Hangi dönem verisi listelensin?"),
      "Period",
    );
    assert.equal(
      inferCriteriaFieldFromQuestion("Raporu şimdi çalıştıralım mı?"),
      undefined,
    );
    assert.equal(inferCriteriaFieldFromQuestion(undefined), undefined);
  });

  it("normalizeChoiceBullets should correctly join isolated bullets/arrows with their values", () => {
    const rawInput =
      "T006 mağazası için 14–20 Eylül 2026 (geçen hafta) Perakende Satış Raporu’nu çalıştıracağım. Hangi şirket koduyla devam edelim?\n\n●\nTJ01\n\n●\nTJ02\n\n●\nTRLC";
    const normalized = normalizeChoiceBullets(rawInput);

    assert.ok(normalized.includes("● TJ01"), "● TJ01 should be joined on a single line");
    assert.ok(normalized.includes("● TJ02"), "● TJ02 should be joined on a single line");
    assert.ok(normalized.includes("● TRLC"), "● TRLC should be joined on a single line");

    // Also verify arrow syntax "->\nTJ01" or "→\nTJ01"
    const arrowInput = "Hangi şirket?\n->\nTJ01\n\n→\nTJ02";
    const arrowNormalized = normalizeChoiceBullets(arrowInput);
    assert.ok(arrowNormalized.includes("-> TJ01"), "-> TJ01 should be joined");
    assert.ok(arrowNormalized.includes("→ TJ02"), "→ TJ02 should be joined");
  });

  it("isQuestionText and isBulletBlock should correctly identify questions and bullets/arrows", () => {
    assert.equal(
      isQuestionText(
        "T006 mağazası için 14–20 Eylül 2026 Perakende Satış Raporu’nu çalıştıracağım. Hangi şirket koduyla devam edelim?",
      ),
      true,
    );
    assert.equal(isQuestionText("Normal bilgilendirme metni."), false);

    assert.equal(isBulletBlock("● TJ01"), true);
    assert.equal(isBulletBlock("-> TJ01"), true);
    assert.equal(isBulletBlock("→ TJ01"), true);
    assert.equal(isBulletBlock("- TJ01"), true);
    assert.equal(isBulletBlock("Normal paragraf"), false);
  });

  it("should record CHOICE_SELECTED telemetry on uiEventBus when choice is made", () => {
    const question = "Hangi şirket koduyla devam edelim?";
    const value = "TJ01";
    const field = inferCriteriaFieldFromQuestion(question);

    uiEventBus.recordTelemetry({
      source: "human_in_the_loop",
      type: "CHOICE_SELECTED",
      details: {
        value,
        label: value,
        questionContext: question,
        inferredField: field,
        targetComponent: "criteria_form",
        timestamp: Date.now(),
      },
    });

    const events = uiEventBus.getRecentEvents({ limit: 10 });
    const match = events.find(
      (e) =>
        e.source === "human_in_the_loop" &&
        e.type === "CHOICE_SELECTED" &&
        (e.details as any)?.value === "TJ01",
    );

    assert.ok(match, "CHOICE_SELECTED event should be recorded in uiEventBus");
    assert.equal((match.details as any)?.inferredField, "CompanyCode");
    assert.equal((match.details as any)?.targetComponent, "criteria_form");
  });

  it("renderPlainBullet should render InteractiveChoiceChip with arrow icon when questionContext is provided", () => {
    let capturedValue = "";
    let capturedField = "";

    const cb: any = {
      onChoiceSelect: (val: string, ctx?: { question?: string; field?: string }) => {
        capturedValue = val;
        capturedField = ctx?.field || "";
      },
    };

    // Test both bullet and arrow inputs
    const el1 = renderPlainBullet(
      "● TJ01",
      "0",
      cb,
      (() => "") as any,
      "Hangi şirket koduyla devam edelim?",
    );

    assert.ok(el1, "Interactive choice chip element should be rendered for bullet");
    const props1 = (el1 as any)?.props;
    assert.equal(props1?.value, "TJ01");

    props1.onSelect("TJ01", { question: "Hangi şirket koduyla devam edelim?", field: "CompanyCode" });
    assert.equal(capturedValue, "TJ01");
    assert.equal(capturedField, "CompanyCode");

    // Test arrow -> syntax
    const el2 = renderPlainBullet(
      "-> TJ02",
      "1",
      cb,
      (() => "") as any,
      "Hangi şirket koduyla devam edelim?",
    );
    assert.ok(el2, "Interactive choice chip element should be rendered for arrow");
    const props2 = (el2 as any)?.props;
    assert.equal(props2?.value, "TJ02");
  });

  it("renderPlainBullet should render static plain bullet when no questionContext is provided", () => {
    const element = renderPlainBullet(
      "● Bilgilendirme metni",
      "0",
      undefined,
      undefined,
      undefined,
    );

    assert.ok(element, "Plain bullet element should be rendered");
    const elProps = (element as any)?.props;
    assert.equal(elProps?.value, undefined);
  });
});
