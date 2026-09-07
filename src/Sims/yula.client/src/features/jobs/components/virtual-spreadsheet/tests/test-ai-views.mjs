import assert from "node:assert/strict";

console.log("🧪 Test: AI SQL Views Management (Non-Autosave, Manual Save, Rename, Delete)");

// Mock storage and AI views state
let mockAiViews = [];
let activeAiViewId = null;
let currentQuerySql = null;
let currentQueryTitle = null;

// AI yeni bir SQL ürettiğinde (oto-kayıt yapmaz)
function handleNewAiQuery(sql, title) {
  currentQuerySql = sql;
  currentQueryTitle = title;
  const existing = mockAiViews.find((v) => v.sql.trim() === sql.trim());
  activeAiViewId = existing ? existing.id : null;
}

// Kullanıcı "Kaydet" dediğinde
function handleSaveCurrentAiView(title) {
  if (!currentQuerySql) return;
  const newView = {
    id: `ai_${Date.now()}_${mockAiViews.length}`,
    title: title || currentQueryTitle || "AI Görünümü",
    sql: currentQuerySql,
    createdAt: Date.now(),
  };
  mockAiViews = [...mockAiViews, newView];
  activeAiViewId = newView.id;
}

function handleSelectAiView(viewId) {
  if (!viewId) {
    currentQuerySql = null;
    currentQueryTitle = null;
    activeAiViewId = null;
    return;
  }
  const target = mockAiViews.find((v) => v.id === viewId);
  if (target) {
    currentQuerySql = target.sql;
    currentQueryTitle = target.title;
    activeAiViewId = target.id;
  }
}

function handleRenameAiView(viewId, nextTitle) {
  mockAiViews = mockAiViews.map((v) =>
    v.id === viewId ? { ...v, title: nextTitle } : v
  );
  if (activeAiViewId === viewId) {
    currentQueryTitle = nextTitle;
  }
}

function handleDeleteAiView(viewId) {
  mockAiViews = mockAiViews.filter((v) => v.id !== viewId);
  if (activeAiViewId === viewId) {
    currentQuerySql = null;
    currentQueryTitle = null;
    activeAiViewId = null;
  }
}

// 1. AI yeni SQL ürettiğinde: View ekranda oluşur ama OTO-KAYIT YAPMAZ
console.log("  ▶ Testing non-autosave behavior on new AI query...");
handleNewAiQuery(
  'SELECT "Warehouse", SUM("Qty") as total_qty FROM "report_stock" GROUP BY "Warehouse"',
  "Depo Bazlı Stok Dağılımı"
);

assert.equal(currentQuerySql !== null, true, "Sorgu ekranda aktif olmalıdır");
assert.equal(mockAiViews.length, 0, "Otomatik kayıt YAPILMAMALIDIR (saved list boş kalmalı)");
assert.equal(activeAiViewId, null, "Kayıtlı olmadığı için activeAiViewId null olmalıdır");

// 2. Kullanıcı "Kaydet" dediğinde kalıcı listeye eklenir
console.log("  ▶ Testing manual save of active AI view...");
handleSaveCurrentAiView("Depo Bazlı Stok Dağılımı");
assert.equal(mockAiViews.length, 1, "Kullanıcı kaydettiğinde 1 adet görünüm oluşmalıdır");
assert.equal(activeAiViewId, mockAiViews[0].id, "Kaydedilen görünümün ID'si aktif olmalıdır");
assert.equal(mockAiViews[0].title, "Depo Bazlı Stok Dağılımı");

// 3. AI ikinci bir sorgu ürettiğinde ama kullanıcı kaydetmediğinde
console.log("  ▶ Testing transient second AI query without saving...");
const firstId = mockAiViews[0].id;
handleNewAiQuery(
  'SELECT * FROM "report_stock" WHERE "Qty" < 0',
  "Geçici Negatif Stoklar"
);

assert.equal(mockAiViews.length, 1, "Kaydedilmemiş sorgu kalıcı listeyi kirletmemelidir");
assert.equal(activeAiViewId, null, "Geçici sorgu için activeAiViewId null olmalıdır");

// Kullanıcı ham veriye dönmek istediğinde geçici sorgu temizlenir
handleSelectAiView(null);
assert.equal(currentQuerySql, null, "Ham veriye dönüldüğünde sorgu sıfırlanmalıdır");
assert.equal(mockAiViews.length, 1, "İlk kaydedilmiş görünüm hala durmalıdır");

// 4. İlk kaydedilmiş görünüme geri dönme
console.log("  ▶ Testing switching back to saved AI view...");
handleSelectAiView(firstId);
assert.equal(currentQueryTitle, "Depo Bazlı Stok Dağılımı", "Kayıtlı görünümün başlığı yüklenmelidir");
assert.equal(activeAiViewId, firstId, "Kayıtlı görünüm seçili olmalıdır");

// 5. Görünüm yeniden adlandırma (Rename)
console.log("  ▶ Testing AI view rename...");
handleRenameAiView(firstId, "Depo ve Stok Özeti (Revize)");
const renamed = mockAiViews.find((v) => v.id === firstId);
assert.equal(renamed.title, "Depo ve Stok Özeti (Revize)", "Başlık güncellenmelidir");
assert.equal(currentQueryTitle, "Depo ve Stok Özeti (Revize)", "Aktif başlık da güncellenmelidir");

// 6. Görünüm silme ve ham veriye dönüş (Delete)
console.log("  ▶ Testing AI view deletion...");
handleDeleteAiView(firstId);
assert.equal(mockAiViews.length, 0, "Silinen görünüm listeden çıkmalıdır");
assert.equal(activeAiViewId, null, "Aktif görünüm silindiğinde ham veriye dönülmelidir");
assert.equal(currentQuerySql, null, "Aktif SQL temizlenmelidir");

console.log("✅ All AI SQL View non-autosave tests PASSED successfully!\n");
