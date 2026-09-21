import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  extractWorkedSteps,
  groupStepsByPhase,
  phasesToStepFrames,
  type WorkedStepItem,
} from "./yula-worked-steps.tsx";
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

  it("query_playbook tool çağrısı çalışırken (isPending/canlı) ekranda Playbook Sub-Agent analiz göstergesi yer alır", () => {
    const msg: YulaMessage = {
      id: "msg-2-live",
      role: "assistant",
      parts: [
        {
          type: "tool-query_playbook",
          toolCallId: "tc-query-live",
          state: "call",
          input: {
            task: "satınalma onay akışı",
            workspace: "purchasing",
          },
        } as any,
      ],
    } as any;

    const steps = extractWorkedSteps(msg, true);
    const liveStep = steps.find((s) => s.id === "tc-query-live");

    assert.ok(liveStep, "query_playbook canlı adımı bulunmalı");
    assert.equal(liveStep.isLive, true, "isLive true olmalı (spinner/pulse aktif)");
    assert.ok(liveStep.label.includes("🤖 Playbook Sub-Agent"), "Etikette Sub-Agent kimliği yer almalı");
    assert.ok(liveStep.subLabel?.includes("🤖 Sub-Agent analiz ediyor"), "Alt etikette Sub-Agent analiz durumu yer almalı");
  });

  it("query_playbook bir reçete ile tamamlandığında Sub-Agent onay etiketi ve güven skoru gösterilir", () => {
    const msg: YulaMessage = {
      id: "msg-2-recipe",
      role: "assistant",
      parts: [
        {
          type: "tool-query_playbook",
          toolCallId: "tc-query-recipe",
          state: "output-available",
          input: {
            task: "satınalma siparişi",
            workspace: "purchasing",
          },
          output: {
            status: "ok",
            recipe: {
              id: "recipe-purchasing-flow",
              title: "Satın Alma Onay Akışı",
              contentMarkdown: "1. Sipariş oluşturulur.\n2. Bütçe onayı alınır.",
            },
            confidence: 0.95,
            message: "Semantik olarak eşleşti",
          },
        } as any,
      ],
    } as any;

    const steps = extractWorkedSteps(msg);
    const recipeStep = steps.find((s) => s.id === "tc-query-recipe");

    assert.ok(recipeStep, "reçete adımı üretilmeli");
    assert.equal(recipeStep.isLive, false);
    assert.ok(recipeStep.label.includes("🤖 Playbook Sub-Agent"));
    assert.ok(recipeStep.subLabel?.includes("Workflow recipe found: Satın Alma Onay Akışı (%95 uyum · Sub-Agent verified)"));
    assert.ok(recipeStep.detailText?.includes("%95 Güven"));
    assert.ok(recipeStep.detailText?.includes("Bütçe onayı alınır"));
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

  it("ask_user_choice ve ask_user_question onay adımlarında asla spinner (isLive: true) görünmez", () => {
    const msg: YulaMessage = {
      id: "msg-choice-1",
      role: "assistant",
      parts: [
        {
          type: "tool-ask_user_choice",
          toolCallId: "tc-choice-1",
          state: "input-available",
          input: {
            question: "Hangi tarih aralığı?",
            options: [{ label: "Son 15 gün", value: "15d" }],
          },
        } as any,
      ],
    } as any;

    // Canlı akışta bile onay kartı spinner göstermemelidir
    const liveSteps = extractWorkedSteps(msg, true);
    const choiceLiveStep = liveSteps.find((s) => s.id === "tc-choice-1");
    assert.ok(choiceLiveStep, "choice adımı üretilmeli");
    assert.equal(choiceLiveStep.isLive, false, "ask_user_choice canlı akışta spinner olmamalı");

    // Akış bittiğinde (false) kesinlikle isLive false olmalı
    const doneSteps = extractWorkedSteps(msg, false);
    const choiceDoneStep = doneSteps.find((s) => s.id === "tc-choice-1");
    assert.ok(choiceDoneStep, "choice adımı üretilmeli");
    assert.equal(choiceDoneStep.isLive, false, "ask_user_choice tamamlandığında spinner olmamalı");
  });
});

describe("groupStepsByPhase - Causal Step Frame & ReAct Entegrasyonu", () => {
  it("hata alan adımdan sonraki adım kurtarma (recovery) olarak işaretlenir", () => {
    const rawSteps: WorkedStepItem[] = [
      {
        id: "step-0-thought",
        kind: "thought",
        label: "Thinking...",
        detailText: "Kolonları keşfetmek için DESCRIBE deniyorum",
        stepIndex: 0,
      },
      {
        id: "step-0-tool",
        kind: "ran",
        label: "Ran SQL: DESCRIBE active_view",
        subLabel: "Hata: SQL query is empty.",
        isError: true,
        stepIndex: 0,
      },
      {
        id: "step-1-thought",
        kind: "thought",
        label: "Thinking...",
        detailText: "DESCRIBE çalışmadı, SELECT * LIMIT 1 ile devam ediyorum",
        stepIndex: 1,
      },
      {
        id: "step-1-tool",
        kind: "ran",
        label: "Ran SQL: SELECT * FROM active_view LIMIT 1",
        isError: false,
        stepIndex: 1,
      },
    ];

    const phases = groupStepsByPhase(rawSteps);
    assert.equal(phases.length, 2, "2 faz üretilmeli");

    // Faz 0: Hata
    assert.equal(phases[0].hasError, true, "1. adım hata bayrağı taşımalı");
    assert.equal(phases[0].thought, "Kolonları keşfetmek için DESCRIBE deniyorum");
    assert.equal(phases[0].errorMessage, "SQL query is empty.");
    assert.equal(phases[0].isRecovery, false, "1. adım kurtarma değil ilk adımdır");

    // Faz 1: Kurtarma
    assert.equal(phases[1].hasError, false);
    assert.equal(phases[1].isRecovery, true, "2. adım bir önceki hata yüzünden kurtarma olmalı");
    assert.ok(phases[1].transitionReason?.includes("Hata sonrası kurtarma"));
    assert.equal(phases[1].thought, "DESCRIBE çalışmadı, SELECT * LIMIT 1 ile devam ediyorum");

    // phasesToStepFrames
    const frames = phasesToStepFrames(phases, "test-conv");
    assert.equal(frames.length, 2);
    assert.equal(frames[0].status, "error");
    assert.equal(frames[1].status, "recovered");
    assert.equal(frames[1].parentStepId, "test-conv-step-0");
  });

  it("ask_user_choice içeren faz kullanıcı tercihi doğrulama transitionReason taşır", () => {
    const rawSteps: WorkedStepItem[] = [
      {
        id: "step-0-choice",
        kind: "confirmation",
        label: "Asked: T006 mağazası hangi şirket koduna bağlı?",
        subLabel: "3 options presented",
        info: {
          toolCallId: "tc-choice",
          toolName: "ask_user_choice",
          state: "output-available",
          input: { question: "T006 mağazası hangi şirket koduna bağlı?" },
        },
        stepIndex: 0,
      },
    ];

    const phases = groupStepsByPhase(rawSteps);
    assert.equal(phases.length, 1);
    assert.equal(phases[0].transitionReason, "Kullanıcı tercihi ve eksik kriter doğrulama adımı");
  });
});

describe("extractWorkedSteps - Ekran Bağlamı ve Metinsel Neden-Sonuç Analizi", () => {
  it("metadata.inspection varsa Ekran & Bağlam İncelemesi adımı açık detaylarla üretilir", () => {
    const msg: YulaMessage = {
      id: "msg-inspect-1",
      role: "assistant",
      parts: [{ type: "text", text: "Hazırlanıyor..." }],
      metadata: {
        inspection: {
          route: "/stock",
          phase: "workspace",
          activeReportScope: "retail-sales-report",
          hasMountedForm: false,
          today: "2026-09-21",
        },
      },
    } as any;

    const steps = extractWorkedSteps(msg);
    const inspectStep = steps.find((s) => s.id.includes("context-inspection"));

    assert.ok(inspectStep, "Ekran bağlam inceleme adımı üretilmeli");
    assert.equal(inspectStep.kind, "explored");
    assert.ok(inspectStep.label.includes("/stock"));
    assert.ok(inspectStep.subLabel?.includes("Global alan"));
    assert.ok(inspectStep.detailText?.includes("Perakende Satış Raporu"));
    assert.ok(inspectStep.detailText?.includes("2026-09-21"));
  });

  it("araç çağrısı öncesindeki text parçası (Plan) yapılandırılmış düşünce adımı olarak adımlara eklenir", () => {
    const msg: YulaMessage = {
      id: "msg-plan-1",
      role: "assistant",
      parts: [
        {
          type: "text",
          text: "Plan:\n• Perakende Satış Raporu açılacak.\n• Tarih: 2026-09-14—2026-09-20.\nMağaza T006 için şirket kodunu seçin:",
        },
        {
          type: "tool-ask_user_choice",
          toolCallId: "tc-choice-p1",
          state: "input-available",
          input: { question: "Hangi şirket kodu?" },
        } as any,
      ],
    } as any;

    const steps = extractWorkedSteps(msg);
    const planStep = steps.find((s) => s.id.includes("plan-evaluation"));
    const choiceStep = steps.find((s) => s.id === "tc-choice-p1");

    assert.ok(planStep, "Plan değerlendirme adımı üretilmeli");
    assert.equal(planStep.kind, "thought");
    assert.ok(planStep.label.includes("Değerlendirme & Eylem Planı"));
    assert.ok(planStep.detailText?.includes("Perakende Satış Raporu açılacak"));
    assert.ok(choiceStep, "Tool çağrısı adımı da korunmalı");
  });
});

