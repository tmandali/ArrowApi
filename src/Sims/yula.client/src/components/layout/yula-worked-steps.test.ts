import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extractWorkedSteps } from "./yula-worked-steps.tsx";
import type { YulaMessage } from "@/app/api/agent/chat/route";

describe("extractWorkedSteps - Wiki & Playbook Adımları", () => {
  it("mesajda metadata.wiki varsa en başta Wiki Okuma adımı üretilir", () => {
    const msg: YulaMessage = {
      id: "msg-1",
      role: "assistant",
      parts: [
        { type: "text", text: "Stok bakiye raporu kurallara göre hazırlandı." },
      ],
      metadata: {
        wiki: {
          level: "workspace",
          workspaceId: "stock",
          targetPath: "/stock/stock-balance",
          rulesCount: 2,
          rules: [
            "Kadıköy mağazası için KDV hariç tutarlar baz alınmalıdır.",
            "Tarih aralığı 30 günü geçemez.",
          ],
        },
      },
    } as any;

    const steps = extractWorkedSteps(msg);
    const wikiStep = steps.find((s) => s.id.includes("wiki-level"));

    assert.ok(wikiStep, "Wiki okuma adımı üretilmeli");
    assert.equal(wikiStep.kind, "explored");
    assert.ok(
      wikiStep.label.includes("Read 2 rules from Workspace Wiki (stock)"),
      "Doğru etiket üretilmeli",
    );
    assert.ok(
      wikiStep.subLabel?.includes("/stock/stock-balance"),
      "Hedef rota alt etikette yer almalı",
    );
    assert.ok(
      wikiStep.detailText?.includes("Kadıköy mağazası"),
      "Kural detayları detailText içinde yer almalı",
    );
  });

  it("mesajda metadata.wiki kuralsız olduğunda da (0 rules) kontrol edilen seviye açıkça gösterilir", () => {
    const msg: YulaMessage = {
      id: "msg-1b",
      role: "assistant",
      parts: [
        { type: "text", text: "Genel sistem kuralları geçerli." },
      ],
      metadata: {
        wiki: {
          level: "workspace",
          workspaceId: "selling",
          targetPath: "/selling",
          rulesCount: 0,
          rules: [],
        },
      },
    } as any;

    const steps = extractWorkedSteps(msg);
    const wikiStep = steps.find((s) => s.id.includes("wiki-level"));

    assert.ok(wikiStep, "Wiki kontrol adımı üretilmeli");
    assert.equal(wikiStep.kind, "explored");
    assert.ok(
      wikiStep.label.includes("Checked Workspace Wiki (selling)"),
      "Hangi seviyenin kontrol edildiği etikette olmalı",
    );
    assert.ok(
      wikiStep.subLabel?.includes("system baseline active"),
      "Varsayılan sistem politikasının aktif olduğu belirtilmeli",
    );
  });

  it("query_playbook tool çağrısı yapıldığında sorgulanan seviye ve kurallar açıkça görülür", () => {
    const msg: YulaMessage = {
      id: "msg-2",
      role: "assistant",
      parts: [
        {
          type: "tool-query_playbook",
          toolCallId: "tc-query-1",
          state: "output-available",
          input: {
            task: "stok mutabakatı",
            workspace: "stock",
          },
          output: {
            status: "ok",
            level: "workspace",
            workspaceId: "stock",
            screenRules: ["Depo transferleri ay sonunda kapatılmalıdır."],
            rulesCount: 1,
          },
        } as any,
      ],
    } as any;

    const steps = extractWorkedSteps(msg);
    const queryStep = steps.find((s) => s.id === "tc-query-1");

    assert.ok(queryStep, "query_playbook adımı üretilmeli");
    assert.equal(queryStep.kind, "explored");
    assert.ok(
      queryStep.label.includes('Queried Workspace Wiki (stock): "stok mutabakatı"'),
      "Arama seviyesi ve konusu etikette olmalı",
    );
    assert.ok(
      queryStep.subLabel?.includes("1 rules found in Workspace Wiki (stock)"),
      "Bulunan kural sayısı alt etikette olmalı",
    );
    assert.ok(
      queryStep.detailText?.includes("Depo transferleri ay sonunda kapatılmalıdır."),
      "Detay kural metni bulunmalı",
    );
  });

  it("propose_playbook_update tool çağrısı yapıldığında wiki güncelleme adımı ve detayları açıkça görülür", () => {
    const msg: YulaMessage = {
      id: "msg-3",
      role: "assistant",
      parts: [
        {
          type: "tool-propose_playbook_update",
          toolCallId: "tc-update-1",
          state: "output-available",
          input: {
            category: "screen_rule",
            title: "Kadıköy Mağaza KDV Kuralı",
            content: "Bu ekranda Kadıköy mağazası seçildiğinde KDV hariç fiyatlar gösterilmelidir.",
            target_path: "/stock/stock-balance",
            workspace: "stock",
          },
          output: {
            status: "saved",
            level: "workspace",
            workspaceId: "stock",
            category: "screen_rule",
            title: "Kadıköy Mağaza KDV Kuralı",
          },
        } as any,
      ],
    } as any;

    const steps = extractWorkedSteps(msg);
    const updateStep = steps.find((s) => s.id === "tc-update-1");

    assert.ok(updateStep, "propose_playbook_update adımı üretilmeli");
    assert.equal(updateStep.kind, "edited");
    assert.ok(
      updateStep.label.includes("Updated Workspace Wiki (stock): Kadıköy Mağaza KDV Kuralı"),
      "Güncelleme seviyesi ve başlığı yer almalı",
    );
    assert.ok(
      updateStep.subLabel?.includes("Saved to Workspace Wiki (stock) · Screen Rule"),
      "Kaydedilme durumu ve kategorisi alt etikette olmalı",
    );
    assert.ok(
      updateStep.detailText?.includes("Target: /stock/stock-balance"),
      "Hedef rota ve içerik detay metninde olmalı",
    );
  });

  it("remember_fact ve recall_fact çağrıları kalıcı bellek adımı olarak üretilir", () => {
    const msg: YulaMessage = {
      id: "msg-4",
      role: "assistant",
      parts: [
        {
          type: "tool-remember_fact",
          toolCallId: "tc-rem-1",
          state: "output-available",
          input: {
            key: "preferred_store",
            value: "Kadıköy",
            scope: "persistent",
          },
          output: { status: "saved" },
        } as any,
        {
          type: "tool-recall_fact",
          toolCallId: "tc-rec-1",
          state: "output-available",
          input: { key: "preferred_store" },
          output: { status: "found", value: "Kadıköy" },
        } as any,
      ],
    } as any;

    const steps = extractWorkedSteps(msg);
    const remStep = steps.find((s) => s.id === "tc-rem-1");
    const recStep = steps.find((s) => s.id === "tc-rec-1");

    assert.ok(remStep, "remember_fact adımı üretilmeli");
    assert.ok(remStep.label.includes("preferred_store"));
    assert.ok(recStep, "recall_fact adımı üretilmeli");
    assert.ok(recStep.label.includes("preferred_store"));
  });
});
