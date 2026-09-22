/**
 * Node built-in test runner (ham-metin kancasıyla — prompt zinciri webpack
 * raw-loader'lı .yaml/.md dosyalarını çeker):
 *   npx tsx --import ./src/test-utils/raw-text-register.mjs --test src/lib/yula-agent-prompt.test.ts
 * Katmanlı prompt sözleşmesi: LEVEL 0 persona, faz duvarları, prepare-chain.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildSystemPrompt, isResultGridMeta, resolveEffectiveGrid } from "./yula-agent-prompt.ts";

const testAgent = {
  name: "Satış Danışmanı",
  instructions: "Sen bir satış danışmanısın.",
  tools: [] as string[],
  skills: [] as string[],
};

describe("buildSystemPrompt agent katmanı", () => {
  it("ajansız promptta LEVEL 0 yoktur, Yula kimliği vardır", () => {
    const prompt = buildSystemPrompt({ pathname: "/" });
    assert.ok(!prompt.includes("LEVEL 0"), "LEVEL 0 çıkmamalı");
    assert.ok(prompt.includes('You are "Yula"'), "Yula kimliği olmalı");
  });

  it("ajanlı prompt LEVEL 0 + öncelik sınırını içerir", () => {
    const prompt = buildSystemPrompt({ pathname: "/", agent: testAgent });
    assert.ok(
      prompt.includes("LEVEL 0: ACTIVE AGENT PERSONA (Satış Danışmanı)"),
      "LEVEL 0 başlığı olmalı",
    );
    assert.ok(
      prompt.includes("Sen bir satış danışmanısın."),
      "persona talimatı gömülmeli",
    );
    assert.ok(
      prompt.includes("Precedence is limited to tone and task priorities"),
      "öncelik sınırı yazılmalı",
    );
    assert.ok(
      prompt.includes("phase walls") && prompt.includes("still bind"),
      "faz duvarlarının bağladığı belirtilmeli",
    );
  });

  it("ajan + workspace fazında prepare-chain eklenir", () => {
    const prompt = buildSystemPrompt({
      pathname: "/agents/a-1",
      phase: "workspace",
      agent: testAgent,
    });
    assert.ok(
      prompt.includes("AGENT SESSION PREPARE CHAIN"),
      "prepare-chain kuralı olmalı",
    );
    assert.ok(
      prompt.includes("apply_criteria") && prompt.includes("navigate_to_page"),
      "zincir adımları yazılmalı",
    );
  });

  it("ajan + results fazında prepare-chain YOKTUR, grid kuralları vardır", () => {
    const prompt = buildSystemPrompt({
      pathname: "/stock/stock-balance",
      phase: "results",
      agent: testAgent,
      grid: { tableName: "report_x", columns: ["A", "B"] },
    });
    assert.ok(
      !prompt.includes("AGENT SESSION PREPARE CHAIN"),
      "sonuç fazında zincir çıkmamalı (faz duvarı)",
    );
    assert.ok(
      prompt.includes("ACTIVE TABLE & GRID OPERATIONS"),
      "grid kuralları olmalı",
    );
  });

  it("ajan yok + workspace + rapor-dışı path → katalog kuralları", () => {
    const prompt = buildSystemPrompt({ pathname: "/", phase: "workspace" });
    assert.ok(
      prompt.includes("REPORT CATALOG & NAVIGATION"),
      "katalog kuralları olmalı",
    );
    assert.ok(
      !prompt.includes("AGENT SESSION PREPARE CHAIN"),
      "ajansız zincir çıkmamalı",
    );
  });

  it("ek dosyalar referans bölümüne gömülür", () => {
    const prompt = buildSystemPrompt({
      pathname: "/",
      agent: {
        ...testAgent,
        attachments: [{ name: "fiyatlar.md", content: "güncel liste" }],
      },
    });
    assert.ok(
      prompt.includes("Agent reference documents") &&
        prompt.includes("fiyatlar.md") &&
        prompt.includes("güncel liste"),
      "referans doküman gömülmeli",
    );
  });

  it("soru kuralı tur başına tek çağrı + görünür özet içerir", () => {
    const prompt = buildSystemPrompt({ pathname: "/" });
    assert.ok(
      prompt.includes("at most ONCE per turn"),
      "tek-soru kuralı olmalı",
    );
    assert.ok(
      prompt.includes("never leave the turn text empty"),
      "boş-tur yasağı olmalı",
    );
  });

  it("skill envanteri bölümü yalnızca liste doluyken çıkar", () => {
    const empty = buildSystemPrompt({ pathname: "/", agent: testAgent });
    assert.ok(!empty.includes("USER SKILLS (on-device"), "boşken çıkmamalı");
    const full = buildSystemPrompt({
      pathname: "/",
      agent: testAgent,
      userSkills: [{ slash: "sayim-fark", label: "Sayım", description: "x" }],
    });
    assert.ok(
      full.includes("USER SKILLS (on-device") && full.includes("/sayim-fark"),
      "doluyken listelenmeli",
    );
  });

  it("eksik varlık (anti-confabulation) ve ekran tanıtım sınırı kurallarını içerir", () => {
    const prompt = buildSystemPrompt({ pathname: "/" });
    assert.ok(
      prompt.includes("GROUNDING, MISSING ASSETS & OUT-OF-SCOPE PROTOCOL"),
      "grounding başlığı olmalı",
    );
    assert.ok(
      prompt.includes("MISSING ASSETS (Anti-Confabulation)") &&
        prompt.includes("SCREEN INTRODUCTION BOUNDARY"),
      "eksik varlık ve ekran sınırı kuralları yer almalı",
    );
  });

  it("adım adım bağımlı kriter toplama (step-by-step dependent criteria) kuralını içerir", () => {
    const prompt = buildSystemPrompt({ pathname: "/" });
    assert.ok(
      prompt.includes("STEP-BY-STEP (DEPENDENT) CRITERIA GATHERING"),
      "adım adım kriter toplama kuralı olmalı",
    );
    assert.ok(
      prompt.includes("ONE question per turn") &&
        prompt.includes("narrowing dependent choices dynamically"),
      "tur başına tek soru ve dinamik daraltma talimatı yer almalı",
    );
  });

  it("karar ve onay durumlarında otonom steering kararı ve askıya alma (suspension) protokolünü içerir", () => {
    const prompt = buildSystemPrompt({ pathname: "/" });
    assert.ok(
      prompt.includes("HUMAN-IN-THE-LOOP, SUSPENSION & STEERING PROTOCOL"),
      "HITL ve steering protokolü bulunmalı",
    );
    assert.ok(
      prompt.includes("AUTONOMOUS STEERING DECISION"),
      "Otonom steering kararı kuralı bulunmalı",
    );
    assert.ok(
      prompt.includes("SEAMLESS RESUMPTION VIA STEERING"),
      "Steering ile kesintisiz devam kuralı bulunmalı",
    );
  });

  it("rapor ekranındayken (pathname üzerinden) aktif rapor topraklaması ve kuralı eklenir", () => {
    const prompt = buildSystemPrompt({ pathname: "/stock/stock-balance" });
    assert.ok(
      prompt.includes("Active Report Screen:"),
      "Aktif rapor ekranı satırı olmalı",
    );
    assert.ok(
      prompt.includes("ACTIVE REPORT CONTEXT RULE"),
      "Aktif rapor bağlam kuralı olmalı",
    );
    assert.ok(
      prompt.includes("NEVER ask which report they mean"),
      "Kullanıcıya hangi rapor diye sormama kuralı olmalı",
    );
  });

  it("pathname verilmediğinde uiContext.route üzerinden aktif rapor ve rota çözülür", () => {
    const prompt = buildSystemPrompt({
      uiContext: {
        route: "/stock/stock-balance",
        active_components: [],
        recent_events: [],
      },
    });
    assert.ok(
      prompt.includes("Current Route: /stock/stock-balance"),
      "uiContext.route'tan rota çözülmeli",
    );
    assert.ok(
      prompt.includes("Active Report Screen:"),
      "uiContext.route üzerinden aktif rapor tanınmalı",
    );
    assert.ok(
      prompt.includes("ACTIVE REPORT CONTEXT RULE"),
      "Aktif rapor bağlam kuralı gömülmeli",
    );
  });

  it("aktif rapor ekranındayken diğer inaktif raporların criteria_form bileşenleri filtrelenir", () => {
    const prompt = buildSystemPrompt({
      pathname: "/stock/stock-balance",
      uiContext: {
        route: "/stock/stock-balance",
        active_components: [
          { id: "app_router", capabilities: ["NAVIGATE"] },
          { id: "job_history", capabilities: ["LIST"] },
          { id: "criteria_form:stock-balance", capabilities: ["SET_FIELDS", "SUBMIT"] },
          { id: "criteria_form:store-sales", capabilities: ["SET_FIELDS", "SUBMIT"] },
          { id: "criteria_form:cash-flow", capabilities: ["SET_FIELDS", "SUBMIT"] },
        ],
        recent_events: [],
      },
    });

    assert.ok(prompt.includes("criteria_form:stock-balance"), "Aktif form promptta yer almalı");
    assert.ok(!prompt.includes("criteria_form:store-sales"), "İnaktif store-sales formu filtrelenmeli");
    assert.ok(!prompt.includes("criteria_form:cash-flow"), "İnaktif cash-flow formu filtrelenmeli");
  });

  it("ekran dışındayken (global scope) criteria_form elenir ve GLOBAL ORCHESTRATION & PLAN-FIRST MODE devreye girer", () => {
    const prompt = buildSystemPrompt({
      pathname: "/",
      uiContext: {
        route: "/",
        active_components: [
          { id: "app_router", capabilities: ["NAVIGATE"] },
          { id: "job_history", capabilities: ["LIST"] },
          { id: "criteria_form:stock-balance", capabilities: ["SET_FIELDS", "SUBMIT"] },
        ],
        recent_events: [],
      },
    });

    assert.ok(prompt.includes("GLOBAL ORCHESTRATION & PLAN-FIRST MODE"), "Plan modu direktifi olmalı");
    assert.ok(prompt.includes("NAVIGATION FAST-PATH"), "Saf navigasyon hızlı yolu tarif edilmeli");
    assert.ok(prompt.includes("PLAN-FIRST FOR MULTI-STEP"), "Çok adımlı işler için plan gereksinimi olmalı");
    assert.ok(!prompt.includes("criteria_form:stock-balance"), "Ekran dışındayken form promptta yer almamalı");
  });

  it("ekran içindeyken DIRECT EXECUTION MODE kuralı promptta yer alır", () => {
    const prompt = buildSystemPrompt({
      pathname: "/stock/stock-balance",
      phase: "workspace",
    });

    assert.ok(prompt.includes("DIRECT EXECUTION MODE"), "Doğrudan icra direktifi olmalı");
    assert.ok(prompt.includes("criteria_form:stock-balance"), "Aktif ekranın formu mount edilmeli");
  });

  it("doğrulanmış Playbook kuralları ve tarifleri prompta enjekte edilir", () => {
    const prompt = buildSystemPrompt({
      pathname: "/stock/stock-balance",
      playbookRules: [
        "Kadıköy mağazası için her zaman KDV hariç tutarlar baz alınmalıdır.",
        "Rapor çekilirken tarih aralığı 30 günü geçemez.",
      ],
      playbookRecipes: [
        { title: "Haftalık Stok Kapanışı", summary: "Pazartesi sabahı stok bakiye ve satış raporu karşılaştırması." },
      ],
    });

    assert.ok(
      prompt.includes("=== VERIFIED PLAYBOOK RULES (Company / Screen Guidelines) ==="),
      "Playbook kuralları başlığı bulunmalı",
    );
    assert.ok(
      prompt.includes("Kadıköy mağazası için her zaman KDV hariç tutarlar"),
      "Birinci kural promptta yer almalı",
    );
    assert.ok(
      prompt.includes("Rapor çekilirken tarih aralığı 30 günü geçemez"),
      "İkinci kural promptta yer almalı",
    );
    assert.ok(
      prompt.includes("=== PLAYBOOK RECIPES (Available Procedural Workflows) ==="),
      "Playbook tarifleri başlığı bulunmalı",
    );
    assert.ok(
      prompt.includes("Haftalık Stok Kapanışı: Pazartesi sabahı"),
      "Tarif başlık ve özeti yer almalı",
    );
  });

  it("grounded ERP workflow ve modül kataloğu direktifleri promptta yer alır", () => {
    const prompt = buildSystemPrompt({
      pathname: "/",
      phase: "workspace",
    });

    assert.ok(
      prompt.includes("PLAYBOOK PROCEDURAL KNOWLEDGE & GROUNDED WORKFLOW PROTOCOL"),
      "Grounded workflow protokolü yer almalı",
    );
    assert.ok(
      prompt.includes("NO VERIFIED RECIPE (Anti-Confabulation / Grounded Fallback)"),
      "Anti-confabulation fallback kuralı olmalı",
    );
    assert.ok(
      prompt.includes("Available Enterprise Modules"),
      "Sistem modül envanteri yer almalı",
    );
  });

  it("context.grid olmadan uiContext.active_components meta bilgisinden grid şema grounding türetilir", () => {
    const prompt = buildSystemPrompt({
      pathname: "/stock/retail-sales-report",
      phase: "results",
      uiContext: {
        route: "/stock/retail-sales-report",
        active_components: [
          {
            id: "result_grid:active",
            meta: {
              tableName: "report_c07ec130_7f37_41e1_b196_e666ecd33293",
              columns: ["Depo", "Satis ID", "Miktar", "Tutar"],
              rowCount: 450398,
            },
            capabilities: ["RUN_SQL", "FILTER"],
          },
        ] as any,
      },
    });

    assert.ok(
      prompt.includes("Active table: report_c07ec130_7f37_41e1_b196_e666ecd33293 · 450398 rows."),
      "Tablo adı ve satır sayısı promptta yer almalı",
    );
    assert.ok(
      prompt.includes("Columns: Depo, Satis ID, Miktar, Tutar."),
      "Kolon listesi promptta yer almalı",
    );
    assert.ok(
      prompt.includes('Active DuckDB View: "active_view"'),
      "active_view referansı promptta yer almalı",
    );
  });
});

describe("isResultGridMeta & resolveEffectiveGrid type guards", () => {
  it("validates correct result grid metadata structure", () => {
    assert.equal(
      isResultGridMeta({
        tableName: "report_123",
        columns: ["Depo", "Tutar"],
        rowCount: 100,
      }),
      true
    );

    assert.equal(isResultGridMeta(null), false);
    assert.equal(isResultGridMeta(undefined), false);
    assert.equal(isResultGridMeta({ tableName: "", columns: ["Depo"] }), false);
    assert.equal(isResultGridMeta({ tableName: "report_123", columns: [] }), false);
    assert.equal(isResultGridMeta({ tableName: "report_123", columns: [123] }), false);
  });

  it("resolves effective grid prioritizing explicit context.grid", () => {
    const explicitGrid = { tableName: "explicit_table", columns: ["ColA"] };
    const res = resolveEffectiveGrid({ grid: explicitGrid }, [
      {
        id: "result_grid:active",
        meta: { tableName: "mounted_table", columns: ["ColB"] },
      } as any,
    ]);
    assert.equal(res?.tableName, "explicit_table");
  });

  it("extracts and normalizes grid metadata from mounted result_grid:active component", () => {
    const res = resolveEffectiveGrid(undefined, [
      {
        id: "result_grid:active",
        meta: {
          tableName: "report_c07ec130",
          baseTable: "report_c07ec130",
          isBaseTable: false,
          activeAiViewId: "view_stores",
          customQueryTitle: "Mağaza Satışları",
          savedViews: [{ id: "view_stores", title: "Mağaza Satışları", sql: "SELECT Mağaza..." }],
          columns: ["Depo", "Tutar"],
          rowCount: 450,
          filters: { Depo: "T006", Status: 1 },
          customQuerySql: "SELECT Depo FROM active_view",
        },
      } as any,
    ]);

    assert.equal(res?.tableName, "report_c07ec130");
    assert.equal(res?.baseTable, "report_c07ec130");
    assert.equal(res?.isBaseTable, false);
    assert.equal(res?.activeAiViewId, "view_stores");
    assert.equal(res?.customQueryTitle, "Mağaza Satışları");
    assert.equal(res?.savedViews?.length, 1);
    assert.deepEqual(res?.columns, ["Depo", "Tutar"]);
    assert.equal(res?.rowCount, 450);
    assert.deepEqual(res?.filters, { Depo: "T006", Status: "1" });
    assert.equal(res?.customQuerySql, "SELECT Depo FROM active_view");
    assert.equal(res?.activeViewName, "active_view");
  });

  it("buildSystemPrompt explicitly grounds base table and active saved query distinction", () => {
    const prompt = buildSystemPrompt({
      pathname: "/stock/retail-sales-report",
      phase: "results",
      grid: {
        tableName: "report_raw_table_guid",
        baseTable: "report_raw_table_guid",
        isBaseTable: false,
        activeAiViewId: "view_top_5",
        customQueryTitle: "En Çok Satan 5 Depo",
        customQuerySql: 'SELECT "Depo", SUM("Miktar") FROM "report_raw_table_guid" GROUP BY "Depo"',
        columns: ["Depo", "Toplam Miktar"],
        rowCount: 5,
        savedViews: [
          { id: "view_top_5", title: "En Çok Satan 5 Depo", sql: 'SELECT "Depo"...' },
          { id: "view_all", title: "Tüm Depolar", sql: 'SELECT * FROM...' },
        ],
      },
    });

    assert.ok(
      prompt.includes('VIEW MODE: SAVED QUERY [ID: "view_top_5"] ("En Çok Satan 5 Depo")'),
      "Seçili kayıtlı sorgu ID ve başlık promptta yer almalı",
    );
    assert.ok(
      prompt.includes('• Base Physical Table: "report_raw_table_guid" (Stores all raw detail records).'),
      "Fiziksel ham veri tablosu açıkça belirtilmeli",
    );
    assert.ok(
      prompt.includes('AVAILABLE SAVED VIEWS: ["En Çok Satan 5 Depo" (ID: view_top_5), "Tüm Depolar" (ID: view_all)].'),
      "Mevcut kayıtlı sorgular listesi promptta yer almalı",
    );
  });

  it("returns undefined if no matching result_grid component is mounted", () => {
    const res = resolveEffectiveGrid(undefined, [
      { id: "app_router", meta: {} } as any,
      { id: "job_history", meta: {} } as any,
    ]);
    assert.equal(res, undefined);
  });
});



