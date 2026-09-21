import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  uiRegistry,
  uiEventBus,
  executeComponentAction,
  type ComponentSchema,
  Agent,
  AgentSession,
} from "@my-agent/core";
import { REGISTERED_REPORTS } from "@/features/reports/report-registry";

describe("🤖 Yula Client UI-Agent Etkileşim ve Kuyruk Simülasyonu", () => {
  it("kullanıcı 'geçen hafta' dediğinde ask_user_choice ile seçenek sunulması ve seçilen tarihle raporun çalıştırılması akışını simüle etmelidir", async () => {
    uiRegistry.clear();
    uiEventBus.clear();

    const report = REGISTERED_REPORTS.find((r) => r.scope === "retail-sales-report")!;
    const formCompId = `criteria_form:${report.scope}`;

    let capturedPiChoiceEvent: any = null;
    const choiceInput = {
      question: "“Geçen hafta” için hangi tarih aralığını kullanayım?",
      options: [
        {
          label: "Önceki takvim haftası",
          value: "2026-09-07..2026-09-13",
          description: "Pazartesi–Pazar: 7–13 Eylül 2026",
        },
        {
          label: "Son 7 gün",
          value: "2026-09-12..2026-09-18",
          description: "12–18 Eylül 2026",
        },
      ],
      allow_custom: true,
    };

    // Core server araç setindeki execute'ı çalıştır
    const { agentUiTools, piEventStream: streamInstance } = await import("@my-agent/core");
    const unsubStream = streamInstance.subscribe((event) => {
      if (event.type === "user_choice_prompt") {
        capturedPiChoiceEvent = event;
      }
    });

    const coreChoiceTool = (agentUiTools as any)?.ask_user_choice;
    assert.ok(coreChoiceTool, "ask_user_choice aracı agentUiTools içinde tanımlı olmalı");

    const choiceOutput = await coreChoiceTool.execute(choiceInput);

    assert.equal(choiceOutput.success, true, "Seçenek sunumu başarılı olmalı");
    assert.equal(choiceOutput.status, "waiting_user_selection", "Kullanıcı seçimi bekleme durumunda olmalı");
    assert.equal(choiceOutput.options.length, 2, "2 seçenek sunulmalı");

    // Pi EventStream'e user_choice_prompt düştüğünü doğrula
    assert.ok(capturedPiChoiceEvent, "piEventStream'e user_choice_prompt olayı düşmeli");
    assert.equal(capturedPiChoiceEvent?.question, choiceInput.question);
    assert.equal(capturedPiChoiceEvent?.options.length, 2);

    // 2. Kullanıcı seçimini simüle et: Kullanıcı 1. seçeneği (Önceki takvim haftası) seçer
    const selectedOption = choiceInput.options[0];
    assert.equal(selectedOption.value, "2026-09-07..2026-09-13");

    // 3. Form bileşenini mount et
    const formSchema: ComponentSchema = {
      id: formCompId,
      meta: { description: `${report.title} Criteria Form`, scope: report.scope },
      actions: {
        SET_FIELDS: {
          description: "Applies criteria values",
          whenToCall: "When populating criteria",
          whenNotToCall: "When already populated",
        },
        APPLY: {
          description: "Applies criteria values",
          whenToCall: "When populating criteria",
          whenNotToCall: "When already populated",
        },
        SUBMIT: {
          description: "Executes the report",
          whenToCall: "On execute command",
          whenNotToCall: "When missing required criteria",
        },
        RUN: {
          description: "Executes the report",
          whenToCall: "On execute command",
          whenNotToCall: "When missing required criteria",
        },
      },
    };
    uiRegistry.register(formSchema);

    let appliedCriteria: Record<string, unknown> | null = null;
    let runExecuted = false;

    const unsubForm = uiEventBus.subscribe(formCompId, (action, payload) => {
      if (action === "APPLY") {
        appliedCriteria = payload?.criteria as Record<string, unknown>;
        return { success: true, appliedCriteria };
      }
      if (action === "RUN") {
        runExecuted = true;
        return {
          success: true,
          status: "executed",
          jobId: "retail-job-choice-test",
          navigateTo: `${report.pagePath}?jobId=retail-job-choice-test`,
        };
      }
      return { success: false, error: "Bilinmeyen form aksiyonu" };
    });

    // 4. Model seçilen tarihle form APPLY aksiyonunu çağırır
    const applyRes = await executeComponentAction({
      component_id: formCompId,
      action: "APPLY",
      payload: {
        criteria: {
          sirketKod: "TRCL",
          hareketTarihi: selectedOption.value,
        },
        report: report.scope,
      },
    });

    assert.equal(applyRes.success, true, "APPLY aksiyonu başarılı olmalı");
    assert.deepEqual(
      appliedCriteria,
      {
        sirketKod: "TRCL",
        hareketTarihi: "2026-09-07..2026-09-13",
      },
      "Seçilen takvim haftası tarihi ve şirket kodu forma doğru aktarılmalı",
    );

    // 5. Ardından RUN aksiyonunu çağırır
    const runRes = await executeComponentAction({
      component_id: formCompId,
      action: "RUN",
      payload: {
        criteria: appliedCriteria,
        report: report.scope,
      },
    });

    assert.equal(runRes.success, true, "RUN aksiyonu başarılı olmalı");
    assert.equal(runExecuted, true, "Rapor işi başarıyla çalıştırılmış olmalı");
    assert.equal((runRes.details as any)?.jobId, "retail-job-choice-test");

    unsubStream();
    unsubForm();
    uiRegistry.unregister(formCompId);
  });

  it("⚡ Pi Steering ve 📥 Follow-up kuyruğu doğru yönetilmeli ve sırayla tüketilmelidir", async () => {
    const session = new AgentSession({
      agent: new Agent({
        tools: [],
        streamFn: async () => ({
          message: { role: "assistant", content: "" },
          toolCalls: [],
        }),
      }),
    });

    // 1. Temiz başlangıç
    session.clearSteering();
    session.clearFollowUp();

    assert.equal(session.hasSteering(), false);
    assert.equal(session.hasFollowUp(), false);

    // 2. Anlık araya girme (Steering) ekle
    session.steer("Dur, Kadıköy yerine Beşiktaş'ı seç!");
    assert.equal(session.hasSteering(), true);
    assert.equal(session.getSteeringQueue().length, 1);
    assert.equal(
      session.getSteeringQueue()[0].content,
      "Dur, Kadıköy yerine Beşiktaş'ı seç!",
    );

    // 3. Takip görevi (Follow-up) ekle
    session.followUp("Rapor bitince sonuçları CSV olarak indir.");
    assert.equal(session.hasFollowUp(), true);
    assert.equal(session.getFollowUpQueue().length, 1);
    assert.equal(
      session.getFollowUpQueue()[0].content,
      "Rapor bitince sonuçları CSV olarak indir.",
    );

    // 4. Kuyruktan ilk steer mesajı tüketilsin
    const nextSteer = session.popSteer();
    assert.ok(nextSteer);
    assert.equal(nextSteer.role, "user");
    assert.equal(nextSteer.content, "Dur, Kadıköy yerine Beşiktaş'ı seç!");
    assert.equal(session.hasSteering(), false);

    // 5. Steering bitince follow-up tüketilsin
    const nextFollowUp = session.popFollowUp();
    assert.ok(nextFollowUp);
    assert.equal(nextFollowUp.role, "user");
    assert.equal(nextFollowUp.content, "Rapor bitince sonuçları CSV olarak indir.");
    assert.equal(session.hasFollowUp(), false);

    // 6. Kuyruklar tamamen boşalmış olmalı
    assert.equal(session.popSteer(), undefined);
    assert.equal(session.popFollowUp(), undefined);
  });
});
