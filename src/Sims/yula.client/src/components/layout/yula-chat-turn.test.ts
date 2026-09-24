import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  hasVisibleTurnCard,
  hasScreenActionSuccess,
  hasVisibleTurnContent,
  INTERACTIVE_CARD_TOOLS,
  extractNavigationAction,
  isNavigationActionContract,
  isChartActionContract,
  isJobActionContract,
  extractJobStartedAction,
} from "./yula-chat-turn-helpers.tsx";
import { parseChartOutput } from "./yula-chart-utils";
import { parseChoiceData } from "@/lib/yula-choice-inference";
import type { YulaToolPartInfo } from "@/lib/yula-tool-info";

describe("hasVisibleTurnCard & hasVisibleTurnContent", () => {
  it("INTERACTIVE_CARD_TOOLS ask_user_choice, ask_user_question ve suggest_next_steps içerir", () => {
    assert.ok(INTERACTIVE_CARD_TOOLS.has("ask_user_choice"));
    assert.ok(INTERACTIVE_CARD_TOOLS.has("ask_user_question"));
    assert.ok(INTERACTIVE_CARD_TOOLS.has("suggest_next_steps"));
  });

  it("ask_user_choice input-available veya output-available durumunda görünür kart sayılır", () => {
    const pendingChoice: YulaToolPartInfo[] = [
      {
        toolName: "ask_user_choice",
        state: "input-available",
        toolCallId: "call-1",
        input: { question: "Seçim yapın:", options: ["A", "B"] },
      },
    ];
    assert.equal(hasVisibleTurnCard(pendingChoice), true);
    assert.equal(
      hasVisibleTurnContent({ toolParts: pendingChoice, assistantText: "" }),
      true,
    );

    const answeredChoice: YulaToolPartInfo[] = [
      {
        toolName: "ask_user_choice",
        state: "output-available",
        toolCallId: "call-1",
        input: { question: "Seçim yapın:", options: ["A", "B"] },
        output: { choice: "A" },
      },
    ];
    assert.equal(hasVisibleTurnCard(answeredChoice), true);
    assert.equal(
      hasVisibleTurnContent({ toolParts: answeredChoice, assistantText: "" }),
      true,
    );
  });

  it("ask_user_question ve suggest_next_steps kartları görünür sayılır", () => {
    const questionTool: YulaToolPartInfo[] = [
      {
        toolName: "ask_user_question",
        state: "input-available",
        toolCallId: "call-q",
        input: { questions: [{ text: "Şirket nedir?" }] },
      },
    ];
    assert.equal(hasVisibleTurnCard(questionTool), true);
    assert.equal(
      hasVisibleTurnContent({ toolParts: questionTool, assistantText: "" }),
      true,
    );

    const suggestionTool: YulaToolPartInfo[] = [
      {
        toolName: "suggest_next_steps",
        state: "input-available",
        toolCallId: "call-s",
        input: { suggestions: ["Satış raporunu aç"] },
      },
    ];
    assert.equal(hasVisibleTurnCard(suggestionTool), true);
    assert.equal(
      hasVisibleTurnContent({ toolParts: suggestionTool, assistantText: "" }),
      true,
    );
  });

  it("visualize_grid_data grafiği output-available olduğunda görünür kart sayılır", () => {
    const chartTool: YulaToolPartInfo[] = [
      {
        toolName: "visualize_grid_data",
        state: "output-available",
        toolCallId: "call-c",
        output: { chartType: "bar", series: [] },
      },
    ];
    assert.equal(hasVisibleTurnCard(chartTool), true);
    assert.equal(
      hasVisibleTurnContent({ toolParts: chartTool, assistantText: "" }),
      true,
    );
  });

  it("dispatch_component_action VISUALIZE grafiği output-available olduğunda görünür kart sayılır", () => {
    const chartActionTool: YulaToolPartInfo[] = [
      {
        toolName: "dispatch_component_action",
        state: "output-available",
        toolCallId: "call-c2",
        input: {
          component_id: "result_grid:active",
          action: "VISUALIZE",
          payload: { type: "bar", dimension: "Depo", metric: "Tutar" },
        },
        output: { status: "ok", chart: { chartType: "bar", dimensionX: "Depo", dimensionY: ["Tutar"] }, rows: [{ Depo: "D1", Tutar: 100 }] },
      },
    ];
    assert.equal(hasVisibleTurnCard(chartActionTool), true);
    assert.equal(
      hasVisibleTurnContent({ toolParts: chartActionTool, assistantText: "" }),
      true,
    );
  });

  it("dispatch_component_action ekran etkisi (SET_FIELDS vb.) hasScreenActionSuccess döner", () => {
    const setFieldsTool: YulaToolPartInfo[] = [
      {
        toolName: "dispatch_component_action",
        state: "output-available",
        toolCallId: "call-d",
        input: { component_id: "criteria_form:sales", action: "SET_FIELDS" },
        output: { status: "executed" },
      },
    ];
    assert.equal(hasScreenActionSuccess(setFieldsTool), true);
    assert.equal(
      hasVisibleTurnContent({ toolParts: setFieldsTool, assistantText: "" }),
      true,
    );
  });

  it("hiçbir metin, kart veya ekran eylemi yoksa hasVisibleTurnContent false döner (gerçek sessiz tur)", () => {
    const emptyTools: YulaToolPartInfo[] = [];
    assert.equal(
      hasVisibleTurnContent({ toolParts: emptyTools, assistantText: "" }),
      false,
    );
    assert.equal(
      hasVisibleTurnContent({ toolParts: emptyTools, assistantText: "   " }),
      false,
    );

    // Sadece salt-okuma veya iç araç çağrısı başarısızsa
    const failedReadTool: YulaToolPartInfo[] = [
      {
        toolName: "inspect_ui_state",
        state: "output-error",
        toolCallId: "call-err",
        errorText: "Failed to inspect",
      },
    ];
    assert.equal(
      hasVisibleTurnContent({ toolParts: failedReadTool, assistantText: "" }),
      false,
    );
  });

  it("asistan metni veya fallbackMessage varsa hasVisibleTurnContent true döner", () => {
    assert.equal(
      hasVisibleTurnContent({
        toolParts: [],
        assistantText: "Merhaba, size nasıl yardımcı olabilirim?",
      }),
      true,
    );

    assert.equal(
      hasVisibleTurnContent({
        toolParts: [],
        assistantText: "",
        fallbackMessage: { role: "assistant", parts: [{ type: "text", text: "Sonuçlar hazır." }] },
      }),
      true,
    );
  });
});

describe("extractNavigationAction", () => {
  it("output-available durumunda navigateTo ve title barındıran tool çıktısını başarıyla ayıklar", () => {
    const parts: YulaToolPartInfo[] = [
      {
        toolName: "dispatch_component_action",
        state: "output-available",
        toolCallId: "call-nav",
        input: { component_id: "job_history", action: "OPEN_LAST", payload: { report: "retail-sales-report" } },
        output: {
          status: "navigated",
          jobId: "b87622a7-ed5b-45f7-bd43-71e220bba7a2",
          navigateTo: "/stock/retail-sales-report/b87622a7-ed5b-45f7-bd43-71e220bba7a2",
          title: "Perakende Satış Raporu",
          message: "Opened last report: Perakende Satış Raporu",
        },
      },
    ];

    const result = extractNavigationAction(parts);
    assert.ok(result);
    assert.equal(result.navigateTo, "/stock/retail-sales-report/b87622a7-ed5b-45f7-bd43-71e220bba7a2");
    assert.equal(result.title, "Perakende Satış Raporu");
    assert.equal(result.jobId, "b87622a7-ed5b-45f7-bd43-71e220bba7a2");
  });

  it("hata alan veya navigateTo içermeyen tool çıktılarında null döner", () => {
    const failedParts: YulaToolPartInfo[] = [
      {
        toolName: "dispatch_component_action",
        state: "output-error",
        errorText: "Failed navigation",
        toolCallId: "call-fail",
        output: {
          navigateTo: "/stock/retail-sales-report",
          title: "Perakende Satış Raporu",
        },
      },
    ];
    assert.equal(extractNavigationAction(failedParts), null);
  });

  it("details veya content içine sarmalanmış tool çıktısını da başarıyla ayıklar", () => {
    const wrappedParts: YulaToolPartInfo[] = [
      {
        toolName: "dispatch_component_action",
        state: "output-available",
        toolCallId: "call-wrapped",
        input: { component_id: "job_history", action: "OPEN_LAST", payload: { report: "retail-sales-report" } },
        output: {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                status: "navigated",
                jobId: "b87622a7-ed5b-45f7-bd43-71e220bba7a2",
                navigateTo: "/stock/retail-sales-report/b87622a7-ed5b-45f7-bd43-71e220bba7a2",
                title: "Perakende Satış Raporu",
              }),
            },
          ],
          details: {
            status: "navigated",
            jobId: "b87622a7-ed5b-45f7-bd43-71e220bba7a2",
            navigateTo: "/stock/retail-sales-report/b87622a7-ed5b-45f7-bd43-71e220bba7a2",
            title: "Perakende Satış Raporu",
            message: "Opened last report: Perakende Satış Raporu",
          },
        },
      },
    ];

    const result = extractNavigationAction(wrappedParts);
    assert.ok(result);
    assert.equal(result.navigateTo, "/stock/retail-sales-report/b87622a7-ed5b-45f7-bd43-71e220bba7a2");
    assert.equal(result.title, "Perakende Satış Raporu");
    assert.equal(result.jobId, "b87622a7-ed5b-45f7-bd43-71e220bba7a2");
  });

  it("navigasyon sözleşmesi dışındaki araçlarda navigateTo olsa dahi yoksayar (contract-driven)", () => {
    assert.equal(isNavigationActionContract("run_expert_sql", {}), false);
    assert.equal(isNavigationActionContract("profile_grid_table", {}), false);
    assert.equal(
      isNavigationActionContract("dispatch_component_action", {
        component_id: "result_grid:active",
        action: "QUERY",
      }),
      false,
    );

    // Navigasyon sözleşmesine uyanlar
    assert.equal(
      isNavigationActionContract("dispatch_component_action", {
        component_id: "job_history",
        action: "OPEN_LAST",
      }),
      true,
    );
    assert.equal(
      isNavigationActionContract("dispatch_component_action", {
        component_id: "arrow_job_manager:main",
        action: "FIND",
      }),
      true,
    );
    assert.equal(
      isNavigationActionContract("dispatch_component_action", {
        component_id: "app_router",
        action: "NAVIGATE",
      }),
      true,
    );
    assert.equal(isNavigationActionContract("open_last_report", {}), true);
    assert.equal(isNavigationActionContract("navigate_to_page", {}), true);

    // SQL veya grid sorgusu navigateTo döndürse bile extractNavigationAction null dönmelidir
    const nonNavParts: YulaToolPartInfo[] = [
      {
        toolName: "dispatch_component_action",
        state: "output-available",
        toolCallId: "call-query",
        input: { component_id: "result_grid:active", action: "QUERY" },
        output: {
          navigateTo: "/should/not/navigate",
          title: "Fake Title",
        },
      },
    ];
    assert.equal(extractNavigationAction(nonNavParts), null);
  });
});

describe("isChartActionContract & parseChartOutput (Contract-Driven)", () => {
  it("yalnızca grafik sözleşmelerini doğrular", () => {
    assert.equal(isChartActionContract("visualize_grid_data", {}), true);
    assert.equal(
      isChartActionContract("dispatch_component_action", {
        component_id: "result_grid:active",
        action: "VISUALIZE",
      }),
      true,
    );
    assert.equal(
      isChartActionContract("dispatch_component_action", {
        component_id: "result_grid:active",
        action: "CHART",
      }),
      true,
    );
    assert.equal(
      isChartActionContract("dispatch_component_action", {
        component_id: "result_grid:active",
        action: "QUERY",
      }),
      false,
    );
  });

  it("parseChartOutput details veya doğrudan nesne üzerinden grafik çıktısını ayrıştırır (sıfır JSON.parse)", () => {
    const rawOutput = {
      status: "ok",
      success: true,
      chart: {
        chartType: "bar",
        dimensionX: "Magaza",
        dimensionY: ["Tutar"],
        title: "Mağaza Satışları",
      },
      rows: [{ Magaza: "Kadıköy", Tutar: 15000 }],
    };

    const parsed = parseChartOutput(rawOutput);
    assert.ok(parsed);
    assert.equal(parsed.chartType, "bar");
    assert.equal(parsed.dimensionX, "Magaza");
    assert.deepEqual(parsed.dimensionY, ["Tutar"]);
    assert.equal(parsed.rows.length, 1);

    // details içine sarmalanmış çıktıyı da doğrular
    const wrappedOutput = {
      content: [{ type: "text", text: "ok" }],
      details: rawOutput,
    };
    const parsedWrapped = parseChartOutput(wrappedOutput);
    assert.ok(parsedWrapped);
    assert.equal(parsedWrapped.chartType, "bar");

    // Geçersiz veya metin çıktılarda null döner (artık JSON.parse denenmez)
    assert.equal(parseChartOutput("düz metin"), null);
    assert.equal(parseChartOutput(null), null);
  });
});

describe("isJobActionContract & extractJobStartedAction (Contract-Driven)", () => {
  it("yalnızca iş başlatma sözleşmelerini doğrular", () => {
    assert.equal(isJobActionContract("run_job", {}), true);
    assert.equal(
      isJobActionContract("dispatch_component_action", {
        component_id: "criteria_form:retail",
        action: "SUBMIT",
      }),
      true,
    );
    assert.equal(
      isJobActionContract("dispatch_component_action", {
        component_id: "criteria_form:retail",
        action: "RUN",
      }),
      true,
    );
    assert.equal(
      isJobActionContract("dispatch_component_action", {
        component_id: "arrow_job:123",
        action: "RUN",
      }),
      true,
    );
    assert.equal(
      isJobActionContract("dispatch_component_action", {
        component_id: "result_grid:active",
        action: "QUERY",
      }),
      false,
    );
  });

  it("extractJobStartedAction başarılı iş çalıştırma çıktısından jobId ve navigateTo çeker", () => {
    const jobPart: YulaToolPartInfo = {
      toolName: "dispatch_component_action",
      state: "output-available",
      toolCallId: "call-submit",
      input: { component_id: "criteria_form:sales", action: "SUBMIT" },
      output: {
        details: {
          status: "executed",
          jobId: "job-abc",
          navigateTo: "/stock/sales/job-abc",
        },
      },
    };

    const action = extractJobStartedAction(jobPart);
    assert.ok(action);
    assert.equal(action.jobId, "job-abc");
    assert.equal(action.navigateTo, "/stock/sales/job-abc");
  });
});

describe("parseChoiceData (Contract-Driven)", () => {
  it("input veya output.details üzerinden yapılandırılmış seçenekleri doğrudan okur (sıfır regex)", () => {
    const fromInput = parseChoiceData(
      {
        question: "Hangi mağazayı seçmek istersiniz?",
        options: ["Kadıköy", "Beşiktaş"],
        allow_custom: false,
      },
      undefined,
    );
    assert.ok(fromInput);
    assert.equal(fromInput.question, "Hangi mağazayı seçmek istersiniz?");
    assert.equal(fromInput.options.length, 2);
    assert.equal(fromInput.allowCustom, false);

    const fromDetails = parseChoiceData(
      {},
      {
        details: {
          question: "Tarih seçimi yapınız",
          options: [{ label: "Bu Ay", value: "month" }],
          allow_custom: true,
        },
      },
    );
    assert.ok(fromDetails);
    assert.equal(fromDetails.question, "Tarih seçimi yapınız");
    assert.equal(fromDetails.options[0].label, "Bu Ay");
    assert.equal(fromDetails.options[0].value, "month");
  });
});

