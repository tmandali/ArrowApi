import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  calculateContextUsage,
  shouldCompact,
  compactConversation,
  generateLocalSummary,
} from "@my-agent/core";
import { POST as compactRoutePost } from "@/app/api/compact/route";

describe("🤖 Yula Context Window Doluluk ve Compaction Simülasyonu", () => {
  it("mesajlardan context window doluluk oranını (% ve token) doğru hesaplamalıdır", () => {
    const mockMessages = [
      { role: "user", content: "Merhaba, bana son 1 ayın perakende satışlarını çıkar." },
      {
        role: "assistant",
        content: "Hemen inceliyorum...",
        metadata: {
          usage: {
            promptTokens: 1200,
            completionTokens: 300,
            totalTokens: 1500,
          },
        },
      },
    ];

    const usage = calculateContextUsage(mockMessages, "gpt-4o-mini");
    assert.equal(usage.contextWindow, 128000, "Varsayılan context window 128k olmalı");
    assert.equal(usage.tokens, 1500, "Toplam token API kullanımından (1500) alınmalı");
    assert.equal(usage.percent, 1.2, "1500 / 128000 = %1.2 doluluk hesaplanmalı");
  });

  it("eşik aşıldığında shouldCompact doğru şekilde tetiklenmelidir", () => {
    const contextWindow = 128000;
    const settings = {
      enabled: true,
      reserveTokens: 16384,
    };

    // Eşik altı: 100,000 <= 128,000 - 16,384 (111,616)
    assert.equal(shouldCompact(100000, contextWindow, settings), false);

    // Eşik üstü: 115,000 > 111,616
    assert.equal(shouldCompact(115000, contextWindow, settings), true);

    // Ayar kapalıysa tetiklenmemeli
    assert.equal(shouldCompact(115000, contextWindow, { enabled: false }), false);
  });

  it("compactConversation eski mesajları özetleyip en güncel mesajları güvenle korumalıdır", async () => {
    const longHistory: any[] = [];
    // 50 tur konuşma üretelim (toplamda ~30 bin token)
    for (let i = 1; i <= 50; i++) {
      longHistory.push({
        id: `user_${i}`,
        role: "user",
        content: `Soru ${i}: Stok durumu ve raporlama analizlerini detaylandır. ` + "uzun metin ".repeat(40),
      });
      longHistory.push({
        id: `asst_${i}`,
        role: "assistant",
        content: `Yanıt ${i}: Stok hareketleri ve bakiyeler incelendi. ` + "detaylı veri ".repeat(40),
      });
    }

    const { compactedMessages, result } = await compactConversation({
      messages: longHistory,
      modelId: "gpt-4o-mini",
      settings: {
        enabled: true,
        keepRecentTokens: 5000, // Son 5000 tokenlik turları koru
      },
      reason: "threshold",
    });

    assert.ok(result.compactedMessagesCount > 0, "Eski mesajlar özetlenmiş olmalı");
    assert.ok(compactedMessages.length < longHistory.length, "Mesaj sayısı azalmalı");
    assert.equal(compactedMessages[0].role, "system", "İlk mesaj özet system mesajı olmalı");
    assert.ok(compactedMessages[0].id.startsWith("summary_"), "Özet mesaj ID'si summary_ ile başlamalı");

    // Son mesajların korunduğunu doğrula
    const lastOriginal = longHistory[longHistory.length - 1];
    const lastCompacted = compactedMessages[compactedMessages.length - 1];
    assert.equal(lastCompacted.id, lastOriginal.id, "En güncel asistan mesajı korunmalı");
  });

  it("generateLocalSummary çevrimdışı yerel özet metnini yapılandırılmış biçimde üretmelidir", () => {
    const serialized = [
      "[User]: Satış raporunu çalıştır",
      "[Assistant Tool Invocations]: criteria_form(retail-sales-report) => executed",
      "[User]: Tabloyu SQL ile filtrele",
    ].join("\n");

    const summary = generateLocalSummary(serialized);
    assert.ok(summary.includes("Oturum Özeti"), "Özet başlığı içermeli");
    assert.ok(summary.includes("Satış raporunu çalıştır"), "Kullanıcı taleplerini içermeli");
    assert.ok(summary.includes("criteria_form"), "Çalıştırılan araçları içermeli");
  });

  it("/api/compact endpoint'i serializedText aldığında özet dönmelidir", async () => {
    const req = new Request("http://localhost:3000/api/compact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        serializedText: "[User]: 2026 yılı perakende satışlarını incele\n[Assistant]: Tablo hazırlandı.",
      }),
    });

    const res = await compactRoutePost(req);
    assert.equal(res.status, 200, "HTTP 200 dönmeli");
    const json = await res.json();
    assert.ok(json.summary, "Özet alanı dönmeli");
    assert.ok(typeof json.summary === "string", "Özet bir metin olmalı");
  });
});
