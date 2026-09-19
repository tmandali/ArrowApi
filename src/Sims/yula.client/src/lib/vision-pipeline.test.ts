import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { convertToModelMessages } from "ai";

function extractRawUrlOrData(p: { data?: unknown; url?: unknown; image?: unknown }): string | null {
  if (typeof p.data === "string") return p.data;
  if (p.data && typeof p.data === "object" && "url" in p.data) {
    const u = (p.data as { url: unknown }).url;
    return typeof u === "string" ? u : u != null ? String(u) : null;
  }
  if (typeof p.url === "string") return p.url;
  if (p.url && typeof p.url === "object") return String(p.url);
  if (typeof p.image === "string") return p.image;
  return null;
}

describe("Vision pipeline message preparation", () => {
  it("convertToModelMessages sonrası file parçasından base64 tamponunu ve mime tipini başarıyla çıkarır", async () => {
    const sampleBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
    const uiMsg = [
      {
        id: "msg-1",
        role: "user" as const,
        content: "bu ne resmi",
        parts: [
          { type: "text" as const, text: "bu ne resmi" },
          {
            type: "file" as const,
            mediaType: "image/png",
            filename: "ornek.png",
            url: `data:image/png;base64,${sampleBase64}`,
          },
        ],
      },
    ];

    const modelMessages = await convertToModelMessages(uiMsg);
    assert.equal(modelMessages.length, 1);
    const content = modelMessages[0].content;
    assert.ok(Array.isArray(content));

    const filePart = content.find((p: any) => p.type === "file") as any;
    assert.ok(filePart, "file part bulunmalı");

    const raw = extractRawUrlOrData(filePart);
    assert.ok(raw?.startsWith("data:image/png;base64,"), "Ham dataUrl elde edilmeli");

    const base64Data = raw?.split(",")[1];
    assert.equal(base64Data, sampleBase64);

    const buffer = Buffer.from(base64Data!, "base64");
    assert.equal(buffer.length > 0, true);
  });
});
