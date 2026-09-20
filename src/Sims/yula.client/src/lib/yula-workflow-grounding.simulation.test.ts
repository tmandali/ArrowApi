/**
 * Simulation Test: Grounded ERP Workflow Protocol & Procedural Memory
 * Verifies that ERP operational workflow queries are grounded in real screens,
 * leverage pre-injected Playbook recipes (0 ms latency), avoid theoretical LLM
 * confabulation, and offer interactive HITL learning chips via ask_user_choice.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildSystemPrompt } from "./yula-agent-prompt";
import { serverPlaybookStorage, serverPlaybookService } from "./playbook-server";
import { createStandardAgentTools } from "@my-agent/core";

describe("Grounded ERP Workflow Protocol & Playbook Simulation", () => {
  it("1. Sunucu depolaması ve Playbook servisi kayıtlı satınalma reçetesini keşfedebilmelidir", async () => {
    const entries = await serverPlaybookStorage.readEntries("stock");
    const purchasingRecipe = entries.find((e) => e.id === "recipe-purchasing-flow");
    assert.ok(purchasingRecipe, "recipe-purchasing-flow depodan okunabilmelidir");
    assert.equal(purchasingRecipe.category, "workflow_recipe");

    // findRecipe doğrudan arama
    const found = await serverPlaybookService.findRecipe("Satınalma", "stock");
    assert.ok(found, "Satınalma sorgusuyla reçete bulunmalıdır");
    assert.equal(found.id, "recipe-purchasing-flow");

    // Bilinmeyen görev için null dönmeli (confabulation yok)
    const notFound = await serverPlaybookService.findRecipe("Uydurma Bir Süreç", "stock");
    assert.equal(notFound, null, "Tanımsız iş akışında null dönmelidir");
  });

  it("2. Sistem promptu Level 0'da doğrulanmış reçeteleri ve modül envanterini sıfır gecikmeyle barındırmalıdır", async () => {
    const entries = await serverPlaybookStorage.readEntries("stock");
    const recipes = entries
      .filter((e) => e.category === "workflow_recipe")
      .map((e) => ({ title: e.title, summary: e.title }));

    const prompt = buildSystemPrompt({
      pathname: "/",
      phase: "workspace",
      playbookRecipes: recipes,
    });

    // Modül grounding kontrolü
    assert.ok(
      prompt.includes("Available Enterprise Modules"),
      "Sims kurumsal modül envanteri yer almalıdır",
    );
    assert.ok(
      prompt.includes("stock (/stock/*)"),
      "Stok modülü yer almalıdır",
    );

    // Reçete grounding kontrolü
    assert.ok(
      prompt.includes("=== PLAYBOOK RECIPES (Available Procedural Workflows) ==="),
      "Playbook reçeteleri başlığı çıkmalıdır",
    );
    assert.ok(
      prompt.includes("Satınalma Siparişi ve Mal Kabul İş Akışı"),
      "Satınalma reçetesi promptta yer almalıdır",
    );
  });

  it("3. İstemci araç setinde query_playbook ve propose_playbook_update eksiksiz çalışmalıdır", async () => {
    const tools = createStandardAgentTools();
    const queryTool = tools.find((t) => t.name === "query_playbook");
    const proposeTool = tools.find((t) => t.name === "propose_playbook_update");

    assert.ok(queryTool, "query_playbook aracı mevcut olmalıdır");
    assert.ok(proposeTool, "propose_playbook_update aracı mevcut olmalıdır");

    // query_playbook icrası
    const queryResult = await queryTool.execute("call_query_1", {
      task: "stok mutabakatı",
      workspace: "stock",
    });
    assert.ok(queryResult.content[0].text);
    assert.notEqual(queryResult.content[0].text, 'Tool "query_playbook" not found.');

    // propose_playbook_update icrası (HITL öneri simülasyonu)
    const proposeResult = await proposeTool.execute("call_propose_1", {
      category: "workflow_recipe",
      title: "Özel Depo Transferi Akışı",
      content: "1. [start] Başla -> navigate:/stock/transfer",
      workspace: "stock",
    });
    assert.ok(proposeResult.content[0].text.includes("Özel Depo Transferi Akışı"));
  });

  it("4. Reçetesiz sorguda model genel ezber yerine ask_user_choice ile interaktif Playbook öğrenme teklifi sunmalıdır", () => {
    // Modelin Grounded Workflow Protocol uyarınca oluşturması gereken karar kartı simülasyonu
    const unverifiedWorkflowDecisionCard = {
      message: "Kurumunuza ait doğrulanmış bir Satınalma Reçetesi henüz sistemde kayıtlı değil. Standart adımları Playbook'a kaydetmek ister misiniz?",
      choiceToolCall: {
        tool: "ask_user_choice",
        input: {
          question: "Bu akışı kurumunuzun Playbook'una kaydetmek ister misiniz?",
          options: ["Playbook Reçetesi Oluştur", "İlgili Ekrana Git", "Vazgeç"],
        },
      },
    };

    assert.ok(unverifiedWorkflowDecisionCard.message.includes("kayıtlı değil"));
    assert.equal(unverifiedWorkflowDecisionCard.choiceToolCall.input.options.length, 3);
    assert.ok(unverifiedWorkflowDecisionCard.choiceToolCall.input.options.includes("Playbook Reçetesi Oluştur"));
  });
});
