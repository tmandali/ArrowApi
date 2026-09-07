import assert from "node:assert/strict";

console.log("🧪 Test: AI SQL Views Management (Creation, Deduplication, Rename, Delete)");

// Mock storage and AI views state
let mockAiViews = [];
let activeAiViewId = null;

function handleNewAiQuery(sql, title) {
  const existing = mockAiViews.find((v) => v.sql.trim() === sql.trim());
  if (existing) {
    activeAiViewId = existing.id;
    return;
  }

  const newView = {
    id: `ai_${Date.now()}_${mockAiViews.length}`,
    title: title || `AI Görünümü ${mockAiViews.length + 1}`,
    sql,
    createdAt: Date.now(),
  };
  mockAiViews = [...mockAiViews, newView];
  activeAiViewId = newView.id;
}

function handleRenameAiView(viewId, nextTitle) {
  mockAiViews = mockAiViews.map((v) =>
    v.id === viewId ? { ...v, title: nextTitle } : v
  );
}

function handleDeleteAiView(viewId) {
  mockAiViews = mockAiViews.filter((v) => v.id !== viewId);
  if (activeAiViewId === viewId) {
    activeAiViewId = null;
  }
}

// 1. Yeni SQL üretimi ile AI görünümü oluşumu
console.log("  ▶ Testing new AI SQL view creation...");
handleNewAiQuery(
  'SELECT "Warehouse", SUM("Qty") as total_qty FROM "report_stock" GROUP BY "Warehouse"',
  "Depo Bazlı Stok Dağılımı"
);

assert.equal(mockAiViews.length, 1, "1 adet AI görünümü oluşmalıdır");
assert.equal(mockAiViews[0].title, "Depo Bazlı Stok Dağılımı", "Başlık doğru olmalıdır");
assert.equal(activeAiViewId, mockAiViews[0].id, "Oluşturulan görünüm aktif olmalıdır");

// 2. Aynı SQL geldiğinde deduplication (çift kayıt oluşmamalı)
console.log("  ▶ Testing SQL deduplication...");
const firstId = mockAiViews[0].id;
handleNewAiQuery(
  'SELECT "Warehouse", SUM("Qty") as total_qty FROM "report_stock" GROUP BY "Warehouse" ',
  "Farklı Başlık Ama Aynı SQL"
);

assert.equal(mockAiViews.length, 1, "Aynı SQL için ikinci görünüm oluşmamalıdır");
assert.equal(activeAiViewId, firstId, "Mevcut görünümün ID'si aktif kalmalıdır");

// 3. İkinci farklı bir SQL görünümü ekleme
console.log("  ▶ Testing second AI SQL view...");
handleNewAiQuery(
  'SELECT * FROM "report_stock" WHERE "Qty" < 0',
  "Negatif Stoklu Ürünler"
);

assert.equal(mockAiViews.length, 2, "2 adet AI görünümü olmalıdır");
assert.notEqual(activeAiViewId, firstId, "Yeni görünüm aktif olmalıdır");

// 4. Görünüm yeniden adlandırma (Rename)
console.log("  ▶ Testing AI view rename...");
handleRenameAiView(firstId, "Depo ve Stok Özeti (Revize)");
const renamed = mockAiViews.find((v) => v.id === firstId);
assert.equal(renamed.title, "Depo ve Stok Özeti (Revize)", "Başlık güncellenmelidir");

// 5. Görünüm silme ve aktif durum geçişi (Delete)
console.log("  ▶ Testing AI view deletion...");
const secondId = activeAiViewId;
handleDeleteAiView(secondId);

assert.equal(mockAiViews.length, 1, "Silinen görünüm listeden çıkmalıdır");
assert.equal(activeAiViewId, null, "Aktif görünüm silindiğinde aktif ID null (Ham Veri) olmalıdır");

// 6. JSON Serileştirme & Deserileştirme
console.log("  ▶ Testing JSON persistence serialization...");
const serialized = JSON.stringify(mockAiViews);
const deserialized = JSON.parse(serialized);
assert.equal(deserialized.length, 1, "Serileştirme ve geri okuma eşleşmelidir");
assert.equal(deserialized[0].title, "Depo ve Stok Özeti (Revize)");

console.log("✅ All AI SQL View tests PASSED successfully!\n");
