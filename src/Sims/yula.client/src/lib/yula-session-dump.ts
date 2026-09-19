/**
 * Yula Oturum Dump & Adım Adım İnceleme Modülü.
 *
 * @my-agent/core sessionHarness altyapısını kullanarak tüm oturumun
 * (mesajlar, araç çağrıları, UI bileşenleri, ring buffer telemetrisi
 * ve Pi olay şelalesi) eksiksiz anlık görüntüsünü (dump) JSON olarak
 * bilgisayara indirir ve konsola detaylı adım adım döker.
 */
import {
  sessionHarness,
  type SessionDump,
  type ComponentSchema,
  uiRegistry,
  uiEventBus,
} from "@my-agent/core";

export interface DetailedSessionDump extends SessionDump {
  stepByStepTranscript: string;
  activeComponents: ComponentSchema[];
  recentTelemetryEvents: any[];
}

/**
 * Mevcut konuşma geçmişinden okunabilir, adım adım kronolojik bir metin günlüğü üretir.
 */
function formatStepByStepTranscript(
  messages: any[],
  sessionId: string,
  exportedAt: number,
): string {
  const dateStr = new Date(exportedAt).toLocaleString("tr-TR");
  const header = [
    "=".repeat(80),
    "YULA AGENT OTURUM DUMP'I & ADIM ADIM İZLEME RAPORU",
    `Oturum ID : ${sessionId}`,
    `Tarih     : ${dateStr}`,
    `Toplam Tur: ${messages.length} mesaj`,
    "=".repeat(80),
    "",
  ];

  const lines: string[] = [...header];

  messages.forEach((msg, idx) => {
    const role = (msg.role || "unknown").toUpperCase();
    lines.push(`--- [ADIM ${idx + 1}: ${role}] ---`);

    if (msg.content) {
      lines.push(`İçerik: ${msg.content}`);
    }

    // Parçaları ve araç çağrılarını detaylandır
    const parts = Array.isArray(msg.parts) ? msg.parts : [];
    parts.forEach((p: any, pIdx: number) => {
      if (p.type === "text" && p.text !== msg.content) {
        lines.push(`  [Metin Parçası ${pIdx + 1}]: ${p.text}`);
      } else if (p.type === "tool-invocation" || p.toolName) {
        const tName = p.toolName || p.toolInvocation?.toolName || "bilinmeyen-araç";
        const tArgs = p.args || p.toolInvocation?.args || {};
        const tResult = p.result || p.output || p.toolInvocation?.result;
        const tState = p.state || p.toolInvocation?.state || "tamamlandı";

        lines.push(`  [🔧 Araç Çağrısı]: ${tName}`);
        lines.push(`     Durum   : ${tState}`);
        lines.push(`     Girdi   : ${JSON.stringify(tArgs, null, 2)}`);
        if (tResult !== undefined) {
          lines.push(`     Çıktı   : ${JSON.stringify(tResult, null, 2)}`);
        }
      }
    });

    lines.push("");
  });

  return lines.join("\n");
}

/**
 * Canlı oturumun tüm detaylarıyla birlikte dump'ını alır, dosyayı indirir ve konsola yazar.
 */
export function exportDetailedYulaSessionDump(
  messages: any[],
  conversationId: string,
  currentRoute?: string,
): DetailedSessionDump {
  const exportedAt = Date.now();
  const activeComponents = uiRegistry.getActiveComponents();
  const recentTelemetryEvents = uiEventBus.getRecentEvents();

  const currentUiState = {
    route: currentRoute || (typeof window !== "undefined" ? window.location.pathname : "/"),
    activeComponentIds: activeComponents.map((c) => c.id),
  };

  // 1. Temel Session Dump'ı al
  const baseDump = sessionHarness.dumpSession(messages, currentUiState);

  // 2. Adım adım metin transkriptini hazırla
  const stepByStepTranscript = formatStepByStepTranscript(messages, conversationId, exportedAt);

  const fullDump: DetailedSessionDump = {
    ...baseDump,
    sessionId: conversationId || baseDump.sessionId,
    exportedAt,
    stepByStepTranscript,
    activeComponents,
    recentTelemetryEvents,
  };

  // 3. Dosyayı indir
  const filename = `yula_session_dump_${conversationId.slice(0, 8)}_${new Date().toISOString().slice(0, 10)}.json`;
  sessionHarness.exportSessionToFile(fullDump, filename);

  // 4. Geliştirici konsoluna adım adım detayları yazdır
  if (typeof console !== "undefined" && console.group) {
    console.group(`💾 [Yula Session Dump Alındı] - ${conversationId}`);
    console.log("📋 Adım Adım Transkript:\n" + stepByStepTranscript);
    console.log("🧩 Aktif Bileşenler:", activeComponents);
    console.log("📡 Son UI Telemetri Olayları:", recentTelemetryEvents);
    console.log("🌊 Pi Yaşam Döngüsü Olayları:", fullDump.events);
    console.log("📊 Telemetri & Maliyet:", fullDump.telemetrySummary);
    console.log("🧠 Oturum Hafızası:", fullDump.memory);
    console.groupEnd();
  }

  return fullDump;
}
