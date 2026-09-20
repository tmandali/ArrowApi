/**
 * Node built-in test runner (ham-metin kancasıyla — prompt zinciri webpack
 * raw-loader'lı .yaml/.md dosyalarını çeker):
 *   npx tsx --import ./src/test-utils/raw-text-register.mjs --test src/lib/yula-agent-prompt.test.ts
 * Katmanlı prompt sözleşmesi: LEVEL 0 persona, faz duvarları, prepare-chain.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildSystemPrompt } from "./yula-agent-prompt.ts";

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

  it("karar ve onay sorularının düz metin yerine zorunlu olarak ask_user_choice çağırmasını zorunlu kılar", () => {
    const prompt = buildSystemPrompt({ pathname: "/" });
    assert.ok(
      prompt.includes("MANDATORY INTERACTIVE BUTTONS (NO PLAIN-TEXT DECISION QUESTIONS)"),
      "Zorunlu interaktif buton kuralı bulunmalı",
    );
    assert.ok(
      prompt.includes("NEVER write questions ending with 'ister misiniz?'"),
      "Düz metin soru yasağı kuralı bulunmalı",
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
});


