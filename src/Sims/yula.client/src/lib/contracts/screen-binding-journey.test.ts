import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { uiRegistry, uiEventBus, type ActionContract } from "@my-agent/core";
import { z } from "zod";
import { useScreenJourneyStore } from "@/lib/stores/screen-journey-store";
import { executeDispatchComponentAction } from "@/lib/client-tools/dispatch-bridge";
import { buildSystemPrompt } from "@/lib/yula-agent-prompt";

describe("Unified ScreenBinding & Multi-Screen Session Journey", () => {
  it("tracks screen journey enter, exit, and exit snapshots across navigation", () => {
    useScreenJourneyStore.getState().clearJourney();

    // 1. Visit Screen A (Sales Report)
    useScreenJourneyStore.getState().recordScreenEnter("/selling/sales-report", "Perakende Satış Raporu");
    useScreenJourneyStore.getState().recordScreenExit("/selling/sales-report", {
      dateRange: "2026-09-01..2026-09-15",
      rowCount: 1420,
    });

    // 2. Navigate to Screen B (Stock Balance)
    useScreenJourneyStore.getState().recordScreenEnter("/stock/stock-balance", "Stok Bakiye Raporu");
    useScreenJourneyStore.getState().recordScreenExit("/stock/stock-balance", {
      warehouse: "WH-CENTRAL",
      selectedItem: "STK-990",
    });

    // 3. Current Live Screen C (Item Card)
    useScreenJourneyStore.getState().recordScreenEnter("/stock/item", "Stok Kartı Detayı");

    const trail = useScreenJourneyStore.getState().getRecentTrail(5);
    assert.equal(trail.length, 3);
    assert.equal(trail[0].route, "/selling/sales-report");
    assert.deepEqual(trail[0].exitSnapshot, {
      dateRange: "2026-09-01..2026-09-15",
      rowCount: 1420,
    });
    assert.equal(trail[1].route, "/stock/stock-balance");
    assert.deepEqual(trail[1].exitSnapshot, {
      warehouse: "WH-CENTRAL",
      selectedItem: "STK-990",
    });
    assert.equal(trail[2].route, "/stock/item");
    assert.equal(trail[2].exitedAt, undefined); // Currently active
  });

  it("dispatches direct RPC action to mounted UI component via dispatch-bridge without unhandled error", async () => {
    const compId = "entity_form:test_inventory_card";
    const testAction = "UPDATE_QUANTITY";
    let receivedPayload: unknown = null;

    const actionContract: ActionContract = {
      description: "Update inventory count",
      inputSchema: z.object({ qty: z.number() }),
      outputSchema: z.object({ success: z.boolean(), newQty: z.number() }),
    };

    // Simulate mounted React component registering via useAgentComponent / useScreenBinding
    uiRegistry.register({
      id: compId,
      capabilities: [testAction],
      actions: {
        [testAction]: actionContract,
      },
    });

    const unsub = uiEventBus.subscribe(compId, async (action, payload) => {
      if (action === testAction) {
        receivedPayload = payload;
        return { success: true, newQty: (payload as { qty: number }).qty + 10 };
      }
      return { success: false, error: "unknown action" };
    });

    try {
      const result = (await executeDispatchComponentAction({
        component_id: compId,
        action: testAction,
        payload: { qty: 50 },
      })) as { status: string; success: boolean; newQty: number };

      assert.equal(result.status, "ok");
      assert.equal(result.success, true);
      assert.equal(result.newQty, 60);
      assert.deepEqual(receivedPayload, { qty: 50 });
    } finally {
      unsub();
      uiRegistry.unregister(compId);
    }
  });

  it("grounds live screen state, domain guidelines, and session journey in buildSystemPrompt", () => {
    const prompt = buildSystemPrompt({
      pathname: "/stock/item",
      screenJourney: [
        {
          route: "/selling/sales-report",
          screenTitle: "Perakende Satış Raporu",
          enteredAt: Date.now() - 60000,
          exitedAt: Date.now() - 30000,
          exitSnapshot: { lastViewedItem: "STK-990" },
        },
      ],
      uiContext: {
        route: "/stock/item",
        active_components: [
          {
            id: "entity_form:stock_item",
            capabilities: ["SAVE", "UPDATE_PRICE"],
            meta: {
              screenTitle: "Stok Kartı Detayı",
              promptGuidelines: [
                "Fiyat güncellerken KDV dahil/hariç ayrımını kullanıcıya teyit ettir.",
              ],
              state: {
                itemCode: "STK-990",
                itemName: "Endüstriyel Vana",
                currentPrice: 1250,
                activeTab: "fiyatlar",
              },
            },
          },
          {
            id: "session_journey",
            meta: {
              trail: [
                {
                  route: "/selling/sales-report",
                  screenTitle: "Perakende Satış Raporu",
                  enteredAt: Date.now() - 60000,
                  exitedAt: Date.now() - 30000,
                  exitSnapshot: { lastViewedItem: "STK-990" },
                },
              ],
            },
          },
        ],
        recent_events: [],
      },
    });

    // 1. Ekran domain kuralı prompt içine enjekte edildi mi?
    assert.ok(
      prompt.includes("=== ACTIVE SCREEN DOMAIN GUIDELINES ==="),
      "Should contain active screen guidelines section",
    );
    assert.ok(
      prompt.includes("Fiyat güncellerken KDV dahil/hariç ayrımını kullanıcıya teyit ettir."),
      "Should contain specific prompt guideline",
    );

    // 2. Canlı DOM durumu aynalandı mı?
    assert.ok(
      prompt.includes("=== LIVE SCREEN STATE (Real-time DOM State Mirror) ==="),
      "Should contain live screen state section",
    );
    assert.ok(
      prompt.includes('"itemCode":"STK-990"'),
      "Should mirror live itemCode state",
    );

    // 3. Çoklu ekran oturum geçmişi ayrıldı mı?
    assert.ok(
      prompt.includes("=== SESSION SCREEN JOURNEY (Previously Visited Screens & Historical Artifacts) ==="),
      "Should contain session screen journey section",
    );
    assert.ok(
      prompt.includes("Perakende Satış Raporu"),
      "Should list previously visited screen",
    );
    assert.ok(
      prompt.includes('"lastViewedItem":"STK-990"'),
      "Should contain exit snapshot in session journey",
    );

    // 4. session_journey araç bloğu içinde bir UI component olarak görünmemeli
    assert.ok(
      !prompt.includes("Component: session_journey"),
      "session_journey should not be rendered as an interactive action component",
    );
  });
});
