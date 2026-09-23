import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import {
  defineBoundedContext,
  formatBoundedContextPrompt,
  canTransition,
  validateTransition,
  assertTransition,
  BoundedContextContractSchema,
  BoundedStateFieldSchema,
} from "./bounded-context";

describe("BoundedContextContract", () => {
  it("validates Zod schemas for state fields and full contracts", () => {
    const validField = BoundedStateFieldSchema.parse({
      name: "barcode",
      type: "string",
      description: "Ürün EAN-13 barkodu",
      aliases: ["EAN", "Barkod"],
    });
    assert.equal(validField.name, "barcode");

    const validContract = BoundedContextContractSchema.parse({
      id: "supplier_onboarding",
      title: "Tedarikçi Onboarding",
      workspace: "supplier",
      type: "transactional",
      partyReferenceKey: "partyId",
      state: {
        entityName: "CommercialSupplier",
        description: "Ticari hammadde tedarikçisi",
      },
    });
    assert.equal(validContract.partyReferenceKey, "partyId");
  });

  it("defines a masterdata bounded context with state Zod schema and formats LLM prompt", () => {
    const ItemFormZodSchema = z.object({
      itemCode: z.string().min(3),
      stockUom: z.enum(["AD", "KG", "MT"]),
    });

    const itemCtx = defineBoundedContext({
      id: "stock_item",
      title: "Malzeme Yönetimi",
      workspace: "stock",
      type: "masterdata",
      state: {
        entityName: "Item",
        description: "Stokta izlenen ticari mal, hammadde veya mamul kartı.",
        schema: ItemFormZodSchema,
        fields: {
          item_code: {
            description: "Benzersiz malzeme kodu",
            aliases: ["Stok Kodu", "SKU"],
            type: "string",
          },
          stock_uom: {
            description: "Stok ana ölçü birimi",
            aliases: ["Birim"],
            enumValues: [
              { code: "AD", label: "Adet" },
              { code: "KG", label: "Kilogram" },
            ],
          },
        },
        businessRules: [
          "Hareket görmüş malzemenin stok ana birimi değiştirilemez.",
        ],
      },
    });

    assert.equal(itemCtx.id, "stock_item");
    assert.equal(itemCtx.type, "masterdata");

    // Live state validation through the state schema
    const parsed = itemCtx.state.schema?.safeParse({
      itemCode: "STK-100",
      stockUom: "AD",
    });
    assert.equal(parsed?.success, true);

    const prompt = formatBoundedContextPrompt(itemCtx);
    assert.ok(prompt.includes('<active_bounded_context id="stock_item"'));
    assert.ok(prompt.includes("Entity: Item - Stokta izlenen ticari mal"));
    assert.ok(prompt.includes("item_code (string): Benzersiz malzeme kodu [aka: Stok Kodu, SKU]"));
    assert.ok(prompt.includes("Allowed values: [AD: Adet, KG: Kilogram]"));
    assert.ok(prompt.includes("Hareket görmüş malzemenin stok ana birimi değiştirilemez."));
  });

  it("validates deterministic state transitions and prevents invalid step jumps (LLM Guardrails)", () => {
    const processDef = {
      flowName: "SupplierOnboardingFlow",
      initialState: "draft",
      statuses: {
        draft: "Taslak",
        auditing: "Denetimde",
        approved: "Onaylandı",
        rejected: "Reddedildi",
      },
      transitions: [
        { from: "draft", to: "auditing", guard: "has_vkn_and_title" },
        { from: "auditing", to: "approved", guard: "assessment_score_ge_70" },
        { from: "auditing", to: "rejected" },
      ],
    };

    // 1. canTransition checks
    assert.equal(canTransition(processDef, "draft", "auditing"), true);
    assert.equal(canTransition(processDef, "draft", "approved"), false); // Jump forbidden!

    // 2. validateTransition check with structured feedback
    const invalidResult = validateTransition(processDef, "draft", "approved");
    assert.equal(invalidResult.valid, false);
    assert.ok(invalidResult.error?.includes("Taslak"));
    assert.ok(invalidResult.error?.includes("Denetimde"));

    const validResult = validateTransition(processDef, "auditing", "approved");
    assert.equal(validResult.valid, true);

    // 3. assertTransition check
    assert.throws(
      () => assertTransition(processDef, "draft", "approved"),
      /Geçersiz durum geçişi/
    );
    assert.doesNotThrow(() => assertTransition(processDef, "draft", "auditing"));
  });

  it("resolves localized prompt and localized transition errors when translation function is passed", () => {
    const enDict: Record<string, string> = {
      "BoundedContext.StockItem.title": "Item Management (Stock Card)",
      "BoundedContext.StockItem.description": "Master data record for tracked goods.",
      "BoundedContext.StockItem.fields.itemCode_label": "Item Code",
      "BoundedContext.StockItem.fields.itemCode_desc": "Unique item code",
      "BoundedContext.StockItem.fields.itemCode_aliases": "Part Number, SKU",
      "BoundedContext.StockItem.fields.stockUom_label": "Stock UOM",
      "BoundedContext.StockItem.fields.stockUom_desc": "Primary tracking unit",
      "BoundedContext.StockItem.fields.uom_AD": "Piece",
      "BoundedContext.StockItem.fields.uom_KG": "Kilogram",
      "BoundedContext.StockItem.fields.uom_MT": "Meter",
      "BoundedContext.Process.invalid_transition": "Invalid state transition: Cannot transition from '{from}' to '{to}'. Allowed next steps: [{allowed}].",
    };

    const mockT = (key: string, values?: Record<string, string | number>) => {
      let text = enDict[key] || key;
      if (values) {
        for (const [k, v] of Object.entries(values)) {
          text = text.replace(`{${k}}`, String(v));
        }
      }
      return text;
    };

    const localizedCtx = defineBoundedContext({
      id: "stock_item",
      title: "Malzeme Yönetimi (Stok Kartı)",
      titleKey: "title",
      workspace: "stock",
      type: "masterdata",
      i18nNamespace: "BoundedContext.StockItem",
      state: {
        entityName: "Item",
        description: "Stokta izlenen ticari mal veya hammadde.",
        descriptionKey: "description",
        fields: {
          itemCode: {
            description: "Benzersiz malzeme kodu",
            descriptionKey: "fields.itemCode_desc",
            labelKey: "fields.itemCode_label",
            aliases: ["Stok Kodu", "SKU"],
            aliasesKey: "fields.itemCode_aliases",
            type: "string",
          },
          stockUom: {
            description: "Stok ana takip ölçü birimi",
            descriptionKey: "fields.stockUom_desc",
            labelKey: "fields.stockUom_label",
            enumValues: [
              { code: "AD", label: "Adet", labelKey: "fields.uom_AD" },
              { code: "KG", label: "Kilogram", labelKey: "fields.uom_KG" },
            ],
          },
        },
      },
    });

    // Format prompt with English translation function
    const enPrompt = formatBoundedContextPrompt(localizedCtx, mockT as any);
    assert.ok(enPrompt.includes("Title: Item Management (Stock Card)"));
    assert.ok(enPrompt.includes("Entity: Item - Master data record for tracked goods."));
    assert.ok(enPrompt.includes("itemCode (string): Unique item code [aka: Part Number, SKU]"));
    assert.ok(enPrompt.includes("Allowed values: [AD: Piece, KG: Kilogram]"));

    // Validate transition with English error message
    const processDef = {
      flowName: "Lifecycle",
      initialState: "draft",
      statuses: { draft: "Draft", approved: "Approved" },
      transitions: [],
    };
    const res = validateTransition(processDef, "draft", "approved", mockT as any);
    assert.equal(res.valid, false);
    assert.equal(
      res.error,
      "Invalid state transition: Cannot transition from 'Draft' to 'Approved'. Allowed next steps: [Yok (Terminal durum)]."
    );
  });

  it("ensures boundedContext on screen is non-enumerable and safe for JSON.stringify", () => {
    const dummyCtx = defineBoundedContext({
      name: "DummyContext",
      title: "Dummy",
      workspace: "stock",
      type: "masterdata",
      state: {
        entityName: "Dummy",
        description: "Dummy entity",
        fields: {},
      },
      screen: {
        screenId: "dummy_screen",
        screenTitle: "Dummy Screen",
        workspace: "stock",
        category: "workspace_overview",
        aiEnabled: true,
        actions: {},
      },
    });

    // 1. Direct runtime property access works
    assert.equal(dummyCtx.screen.boundedContext, dummyCtx);

    // 2. Property is non-enumerable, preventing circular reference during JSON.stringify
    const descriptor = Object.getOwnPropertyDescriptor(dummyCtx.screen, "boundedContext");
    assert.equal(descriptor?.enumerable, false);

    // 3. JSON.stringify on screen MUST not throw TypeError: Converting circular structure to JSON
    let screenJson = "";
    assert.doesNotThrow(() => {
      screenJson = JSON.stringify(dummyCtx.screen);
    });
    assert.ok(screenJson.includes("dummy_screen"));
    assert.equal(screenJson.includes("DummyContext"), false); // boundedContext skipped due to non-enumerable

    // 4. JSON.stringify on the bounded context itself MUST not throw
    let contextJson = "";
    assert.doesNotThrow(() => {
      contextJson = JSON.stringify(dummyCtx);
    });
    assert.ok(contextJson.includes("DummyContext"));
  });
});

