import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import { useScreenJourneyStore } from "./screen-journey-store";

describe("ScreenJourneyStore Multi-Screen Tracking", () => {
  beforeEach(() => {
    useScreenJourneyStore.getState().clearJourney();
  });

  it("ekran girişini ve navigasyon izini kaydeder", () => {
    const store = useScreenJourneyStore.getState();
    store.recordScreenEnter("/stock/retail-sales-report", "Perakende Satış Raporu");

    const journey = store.getRecentTrail();
    assert.equal(journey.length, 1);
    assert.equal(journey[0].route, "/stock/retail-sales-report");
    assert.equal(journey[0].screenTitle, "Perakende Satış Raporu");
    assert.equal(journey[0].exitedAt, undefined);
  });

  it("ekrandan çıkışta exitSnapshot artefaktını kaydeder", () => {
    const store = useScreenJourneyStore.getState();
    store.recordScreenEnter("/stock/retail-sales-report", "Perakende Satış Raporu");
    store.recordScreenExit("/stock/retail-sales-report", {
      rowCount: 519,
      totalSales: 1450000,
      focusedItem: "ITM-902",
    });

    const journey = store.getRecentTrail();
    assert.equal(journey.length, 1);
    assert.ok(journey[0].exitedAt !== undefined);
    assert.deepEqual(journey[0].exitSnapshot, {
      rowCount: 519,
      totalSales: 1450000,
      focusedItem: "ITM-902",
    });
  });

  it("çoklu ekran geçişinde zincirleme iz oluşturur", () => {
    const store = useScreenJourneyStore.getState();
    store.recordScreenEnter("/stock/retail-sales-report", "Perakende Satış");
    store.recordScreenExit("/stock/retail-sales-report", { totalSales: 1450000 });

    store.recordScreenEnter("/stock/stock-balance", "Stok Bakiye");
    store.recordScreenExit("/stock/stock-balance", { criticalItemsCount: 12 });

    store.recordScreenEnter("/stock/item", "Stok Kartı");

    const journey = store.getRecentTrail();
    assert.equal(journey.length, 3);
    assert.equal(journey[0].route, "/stock/retail-sales-report");
    assert.equal(journey[1].route, "/stock/stock-balance");
    assert.equal(journey[2].route, "/stock/item");
    assert.equal(journey[2].exitedAt, undefined); // Aktif ekran
  });
});
