import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { exportDetailedYulaSessionDump } from "./yula-session-dump";

describe("exportDetailedYulaSessionDump", () => {
  it("creates a detailed dump with step-by-step audit transcript", () => {
    const mockMessages = [
      {
        id: "msg-1",
        role: "user",
        content: "Stok analizi yap",
        parts: [{ type: "text", text: "Stok analizi yap" }],
      },
      {
        id: "msg-2",
        role: "assistant",
        content: "Analiz tamamlandı.",
        parts: [
          {
            type: "tool-invocation",
            toolName: "duckdb_query",
            state: "output-available",
            args: { query: "SELECT * FROM stock LIMIT 5" },
            result: [{ id: 1, name: "Ürün A", qty: 120 }],
          },
          {
            type: "text",
            text: "Analiz tamamlandı.",
          },
        ],
      },
    ];

    const dump = exportDetailedYulaSessionDump(mockMessages, "conv-test-123", "/stock/reports");

    assert.equal(dump.sessionId, "conv-test-123");
    assert.ok(typeof dump.exportedAt === "number");
    assert.ok(dump.stepByStepTranscript.includes("YULA AGENT OTURUM DUMP'I"));
    assert.ok(dump.stepByStepTranscript.includes("conv-test-123"));
    assert.ok(dump.stepByStepTranscript.includes("Stok analizi yap"));
    assert.ok(dump.stepByStepTranscript.includes("duckdb_query"));
    assert.ok(dump.stepByStepTranscript.includes("SELECT * FROM stock LIMIT 5"));
    assert.ok(dump.stepByStepTranscript.includes("Analiz tamamlandı."));
    assert.ok(Array.isArray(dump.activeComponents));
    assert.ok(Array.isArray(dump.recentTelemetryEvents));
  });
});
