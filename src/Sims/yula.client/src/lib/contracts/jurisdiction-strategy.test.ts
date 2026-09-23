import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  defineBoundedContext,
  formatBoundedContextPrompt,
} from "./bounded-context";
import {
  defineJurisdictionStrategy,
  resolveContextStrategy,
} from "./jurisdiction-strategy";

describe("JurisdictionStrategyPattern", () => {
  const baseDeliveryNoteContext = defineBoundedContext({
    id: "stock_delivery_note",
    title: "İrsaliye Yönetimi",
    workspace: "stock",
    type: "transactional",
    state: {
      entityName: "DeliveryNote",
      description: "Temel stok sevk belgesi",
      fields: {
        document_no: { description: "Belge Numarası", type: "string" },
        dispatch_date: { description: "Sevk Tarihi", type: "date" },
      },
      businessRules: ["Sevk tarihi gelecekteki bir tarih olamaz."],
    },
    process: {
      flowName: "StandardDeliveryFlow",
      initialState: "draft",
      statuses: { draft: "Taslak", dispatched: "Sevk Edildi" },
      transitions: [{ from: "draft", to: "dispatched" }],
    },
  });

  const trStrategy = defineJurisdictionStrategy({
    countryCode: "TR",
    stateAugmentation: {
      fields: {
        carrier_vkn: {
          description: "Taşıyıcı firmanın 10 haneli VKN numarası",
          aliases: ["Taşıyıcı VKN", "Lojistik VKN"],
          type: "string",
        },
        gib_uuid: {
          description: "GİB E-İrsaliye evrensel tekil kimlik numarası (UUID)",
          type: "string",
        },
      },
      businessRules: [
        "Taşıyıcı VKN girilmeden GİB sevk yanıtı alınamaz.",
      ],
    },
    processAugmentation: {
      additionalStatuses: { gib_approved: "GİB Onaylı" },
      additionalTransitions: [{ from: "dispatched", to: "gib_approved" }],
    },
  });

  const deStrategy = defineJurisdictionStrategy({
    countryCode: "DE",
    stateAugmentation: {
      fields: {
        ust_id_nr: {
          description: "Alman KDV Kimlik Numarası (USt-IdNr)",
          aliases: ["USt-IdNr", "VAT ID"],
          type: "string",
        },
        gobd_log_id: {
          description: "GoBD mevzuatına uygun değiştirilemez işlem log ID'si",
          type: "string",
        },
      },
      businessRules: [
        "GoBD kuralları gereği sevk belgesi oluşturulduktan sonra doğrudan silinemez (Stornobeleg zorunludur).",
      ],
    },
  });

  const contextWithStrategies = {
    ...baseDeliveryNoteContext,
    strategies: {
      TR: trStrategy,
      DE: deStrategy,
    },
  };

  it("resolves TR strategy when countryCode is TR", () => {
    const trEffective = resolveContextStrategy(contextWithStrategies, "TR");

    assert.equal(trEffective.meta?.resolvedJurisdiction, "TR");
    assert.ok(trEffective.state.fields?.carrier_vkn);
    assert.ok(trEffective.state.fields?.gib_uuid);
    assert.ok(trEffective.state.fields?.document_no); // Base preserved
    assert.ok(
      trEffective.state.businessRules?.includes(
        "Taşıyıcı VKN girilmeden GİB sevk yanıtı alınamaz."
      )
    );
    assert.ok(trEffective.process?.statuses.gib_approved); // Augmented status
    assert.equal(trEffective.process?.transitions.length, 2); // Base (1) + TR (1)

    // Formats into LLM prompt correctly
    const prompt = formatBoundedContextPrompt(trEffective);
    assert.ok(prompt.includes("carrier_vkn"));
    assert.ok(prompt.includes("Taşıyıcı VKN girilmeden GİB sevk"));
    assert.ok(prompt.includes("dispatched -> gib_approved"));
  });

  it("resolves DE strategy when countryCode is DE without contaminating with TR fields", () => {
    const deEffective = resolveContextStrategy(contextWithStrategies, "DE");

    assert.equal(deEffective.meta?.resolvedJurisdiction, "DE");
    assert.ok(deEffective.state.fields?.ust_id_nr);
    assert.ok(deEffective.state.fields?.gobd_log_id);
    assert.ok(!deEffective.state.fields?.carrier_vkn); // TR field NOT present!
    assert.ok(
      deEffective.state.businessRules?.some((r) => r.includes("GoBD kuralları"))
    );

    const prompt = formatBoundedContextPrompt(deEffective);
    assert.ok(prompt.includes("ust_id_nr"));
    assert.ok(!prompt.includes("GİB")); // Zero hallucination / no Turkish tax in German prompt
  });

  it("falls back to base context when countryCode is undefined or unregistered", () => {
    const fallback = resolveContextStrategy(contextWithStrategies, "FR");
    assert.equal(fallback, contextWithStrategies);
  });

  it("allows strategy to override (ezmek) base fields and transitions cleanly", () => {
    const overrideStrategy = defineJurisdictionStrategy({
      countryCode: "US",
      stateAugmentation: {
        fields: {
          document_no: {
            description: "Overridden US Document Number Format",
            aliases: ["US-DOC-NO"],
            type: "string",
          },
        },
      },
      processAugmentation: {
        additionalTransitions: [
          {
            from: "draft",
            to: "dispatched",
            action: "usCustomDispatch",
            description: "Overridden US Dispatch Transition",
          },
        ],
      },
    });

    const ctx = {
      ...baseDeliveryNoteContext,
      strategies: { US: overrideStrategy },
    };

    const effective = resolveContextStrategy(ctx, "US");
    // Field overridden
    assert.equal(effective.state.fields?.document_no.description, "Overridden US Document Number Format");
    assert.deepEqual(effective.state.fields?.document_no.aliases, ["US-DOC-NO"]);
    // Transition overridden (still 1 transition, not 2 duplicates)
    assert.equal(effective.process?.transitions.length, 1);
    assert.equal(effective.process?.transitions[0].action, "usCustomDispatch");
  });
});
