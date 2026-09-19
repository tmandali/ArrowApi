import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  uiRegistry,
  uiEventBus,
  executeComponentAction,
  type ComponentSchema,
  piEventStream,
  steeringManager,
} from "@my-agent/core";
import { executeAgentToolCall } from "@my-agent/react";
import { REGISTERED_REPORTS } from "@/features/reports/report-registry";

describe("🤖 Yula Client UI-Agent Rota ve Navigasyon Simülasyonu", () => {
  it("app_router NAVIGATE eylemini çalıştırıp rotayı doğru normalize etmelidir", async () => {
    // 1. Simülasyon ortamını temizle
    uiRegistry.clear();
    uiEventBus.clear();

    let navigatedPath: string | null = null;

    // 2. Yula ChatInstance'daki app_router sözleşmesini mount et
    const routerSchema: ComponentSchema = {
      id: "app_router",
      meta: { description: "Page and Route Navigator" },
      actions: {
        NAVIGATE: {
          description: "Navigates the user to a target page or report ({ path }).",
          whenToCall: "When the user wants to navigate to another report, workspace, or page.",
          whenNotToCall: "When the user is already on the target screen.",
        },
      },
    };
    uiRegistry.register(routerSchema);

    const unsubRouter = uiEventBus.subscribe("app_router", (action, payload) => {
      if (action === "NAVIGATE" && payload?.path) {
        let rawPath = String(payload.path).trim();
        let targetPath = rawPath;
        const clean = targetPath.replace(/^\//, "").toLowerCase();
        const matched = REGISTERED_REPORTS.find(
          (r) =>
            r.pagePath.toLowerCase() === targetPath.toLowerCase() ||
            r.scope.toLowerCase() === clean ||
            clean.endsWith(r.scope.toLowerCase()) ||
            r.aliases.some((a) => a.toLowerCase() === clean),
        );
        if (matched) {
          targetPath = matched.pagePath;
        }
        navigatedPath = targetPath;
        return { success: true, navigatedTo: targetPath };
      }
      return { success: false, error: "Bilinmeyen router aksiyonu" };
    });

    // 3. Modelin ürettiği '/retail-sales-report' çağrısını simüle et
    const result = await executeComponentAction({
      component_id: "app_router",
      action: "NAVIGATE",
      payload: {
        path: "/retail-sales-report",
      },
    });

    // 4. Doğrulamalar
    assert.equal(result.success, true, "Eylem başarılı dönmeli");
    assert.equal(navigatedPath, "/stock/retail-sales-report", "Hedef rota /stock/retail-sales-report olmalı");

    unsubRouter();
    uiRegistry.unregister("app_router");
  });

  it("criteria_form nesne formatındaki tarih aralığını ({from, to}) normalize edip taslağa yazmalıdır", async () => {
    uiRegistry.clear();
    uiEventBus.clear();

    const { applyCriteriaToDraft } = await import("@/features/report-criteria/lib/apply-criteria-to-draft");
    const { useDraftCriteriaStore } = await import("@/store/slices/draft-criteria-store");

    const res = applyCriteriaToDraft("stock-balance", {
      kayitTarihi: {
        from: "2026-09-07",
        to: "2026-09-13",
      },
    });

    assert.equal(res.ok, true, "applyCriteriaToDraft başarılı olmalı");
    const draft = useDraftCriteriaStore.getState().rowsByScope["stock-balance"];
    const row = draft?.find((r) => r.name === "kayitTarihi");
    assert.ok(row, "kayitTarihi satırı taslakta bulunmalı");
    assert.equal(row?.value, "2026-09-07..2026-09-13", "Tarih nesnesi 'from..to' formatına normalize edilmeli");
  });

  it("kullanıcı başka sayfadayken criteria_form:retail-sales-report çağrıldığında headless çalışıp hedef sayfaya yönlendirmelidir", async () => {
    uiRegistry.clear();
    uiEventBus.clear();

    let routedPath: string | null = null;
    const fakeRouter = {
      push: (path: string) => {
        routedPath = path;
      },
    };

    // ChatInstance seviyesindeki Headless Form kaydı
    const report = REGISTERED_REPORTS.find((r) => r.scope === "retail-sales-report")!;
    const formCompId = `criteria_form:${report.scope}`;
    const formSchema: ComponentSchema = {
      id: formCompId,
      meta: {
        reportScope: report.scope,
        screenTitle: report.title,
        pagePath: report.pagePath,
        workspaceId: report.workspace,
        isHeadless: true,
      },
      actions: {
        SET_FIELDS: {
          description: "Populates criteria fields and navigates to the page.",
          whenToCall: "When updating criteria.",
          whenNotToCall: "Before running the form.",
        },
        APPLY: {
          description: "Populates criteria fields and navigates to the page.",
          whenToCall: "When updating criteria.",
          whenNotToCall: "Before running the form.",
        },
        SUBMIT: {
          description: "Executes the report and navigates to the result screen.",
          whenToCall: "When requesting to run the report.",
          whenNotToCall: "When drafting criteria.",
        },
        RUN: {
          description: "Executes the report and navigates to the result screen.",
          whenToCall: "When requesting to run the report.",
          whenNotToCall: "When drafting criteria.",
        },
      },
    };
    uiRegistry.register(formSchema);
    const unsub = uiEventBus.subscribe(formCompId, async (action, payload) => {
      const { executeDispatchComponentAction } = await import("@/lib/client-tools/dispatch-bridge");
      const res = (await executeDispatchComponentAction({
        component_id: formCompId,
        action,
        payload: { ...payload, report: report.scope },
      })) as Record<string, unknown> | null;

      if (res && typeof res === "object") {
        const navTarget =
          (res.navigateTo as string) ||
          (action === "APPLY" || action === "RUN" ? report.pagePath : undefined);
        if (navTarget) {
          fakeRouter.push(navTarget);
        }
      }
      return res;
    });

    // Ana sayfadan (/), henüz o sayfa mount edilmemişken APPLY çağrısı yapıyoruz
    const res = await executeComponentAction({
      component_id: "criteria_form:retail-sales-report",
      action: "APPLY",
      payload: {
        report: "retail-sales-report",
        criteria: {
          hareketTarihi: {
            from: "2026-09-01",
            to: "2026-09-30",
          },
          sirketKod: "TRLC",
        },
      },
    });

    assert.equal(res.success, true, "Headless çağrı preflight'tan başarıyla geçmeli");
    assert.equal(routedPath, "/stock/retail-sales-report", "Hedef rapor sayfasına otomatik yönlenmeli");

    unsub();
    uiRegistry.unregister(formCompId);
  });

  it("criteria_form RUN eyleminde çıktı detaylarını zenginleştirmeli ve app_router NAVIGATE olayını açıkça fırlatmalıdır", async () => {
    uiRegistry.clear();
    uiEventBus.clear();

    const emittedEvents: Array<{ type: string; toolName?: string; args?: any; result?: any; toolCallId?: string }> = [];
    const unsubStream = piEventStream.subscribe((ev) => {
      emittedEvents.push(ev as any);
    });

    let navigatedPath: string | null = null;
    const fakeRouter = {
      push: (path: string) => {
        navigatedPath = path;
      },
    };

    // 1. app_router kaydı
    const routerSchema: ComponentSchema = {
      id: "app_router",
      meta: { description: "Page and Route Navigator" },
      actions: {
        NAVIGATE: {
          description: "Navigates the user to a target page or report ({ path }).",
          whenToCall: "When the user wants to navigate between pages.",
          whenNotToCall: "When the user is already on the current page.",
        },
      },
    };
    uiRegistry.register(routerSchema);
    const unsubRouter = uiEventBus.subscribe("app_router", (action, payload) => {
      if (action === "NAVIGATE" && payload?.path) {
        let rawPath = String(payload.path).trim();
        const [basePath, search] = rawPath.split("?");
        const clean = basePath.replace(/^\//, "").toLowerCase();
        const matched = REGISTERED_REPORTS.find(
          (r) =>
            r.pagePath.toLowerCase() === basePath.toLowerCase() ||
            r.scope.toLowerCase() === clean ||
            clean.endsWith(r.scope.toLowerCase()) ||
            r.aliases.some((a) => a.toLowerCase() === clean),
        );
        let targetPath = matched ? matched.pagePath : basePath;
        if (search) {
          targetPath = `${targetPath}?${search}`;
        }
        fakeRouter.push(targetPath);
        return { success: true, navigatedTo: targetPath };
      }
      return { success: false, error: "Unknown router action" };
    });

    // 2. Headless form kaydı
    const report = REGISTERED_REPORTS.find((r) => r.scope === "retail-sales-report")!;
    const formCompId = `criteria_form:${report.scope}`;
    const formSchema: ComponentSchema = {
      id: formCompId,
      meta: {
        reportScope: report.scope,
        screenTitle: report.title,
        pagePath: report.pagePath,
        workspaceId: report.workspace,
        isHeadless: true,
      },
      actions: {
        SUBMIT: {
          description: "Executes the report and navigates to the result screen.",
          whenToCall: "When requesting to run the report.",
          whenNotToCall: "When drafting the form.",
        },
        RUN: {
          description: "Executes the report and navigates to the result screen.",
          whenToCall: "When requesting to run the report.",
          whenNotToCall: "When drafting the form.",
        },
      },
    };
    uiRegistry.register(formSchema);
    const unsubForm = uiEventBus.subscribe(formCompId, async () => {
      // Simüle edilen run sonucu (API çağrısı)
      const res = {
        status: "executed",
        jobId: "test-job-12345",
        navigateTo: `/stock/retail-sales-report?jobId=test-job-12345`,
        message: "Job accepted and queued (test-job-12345).",
      };

      const navTarget = res.navigateTo || report.pagePath;
      if (navTarget) {
        const navToolCallId = `nav_${Date.now()}`;
        piEventStream.emit({
          type: "tool_execution_start",
          toolCallId: navToolCallId,
          toolName: "dispatch_component_action",
          args: {
            component_id: "app_router",
            action: "NAVIGATE",
            payload: { path: navTarget },
          },
        });
        let navOutcome: any;
        try {
          if (uiRegistry.has("app_router")) {
            navOutcome = uiEventBus.dispatch({
              component_id: "app_router",
              action: "NAVIGATE",
              payload: { path: navTarget },
            });
          } else {
            fakeRouter.push(navTarget);
            navOutcome = { success: true, result: { navigatedTo: navTarget } };
          }
        } catch (err) {
          fakeRouter.push(navTarget);
          navOutcome = { success: false, error: String(err) };
        }
        const cleanNavOutput =
          navOutcome?.result ?? { success: navOutcome?.success, navigatedTo: navTarget };
        piEventStream.emit({
          type: "tool_execution_end",
          toolCallId: navToolCallId,
          toolName: "dispatch_component_action",
          result: cleanNavOutput,
          isError: !navOutcome?.success,
        });
      }
      return res;
    });

    // 3. executeAgentToolCall ile dispatch_component_action RUN çalıştır
    const toolCallRes = await executeAgentToolCall({
      toolCallId: "call_run_test",
      toolName: "dispatch_component_action",
      args: {
        component_id: "criteria_form:retail-sales-report",
        action: "RUN",
        payload: {
          report: "retail-sales-report",
        },
      },
      state: "call",
    });

    // 4. Doğrulamalar:
    // a) Tool çıktısı zenginleştirilmiş mi (jobId, navigateTo, status)?
    assert.equal(toolCallRes.isError, false, "Tool call hatasız olmalı");
    assert.ok(typeof toolCallRes.result === "object", "Sonuç bir nesne olmalı");
    assert.equal(toolCallRes.result.status, "executed", "status: executed dönmeli");
    assert.equal(toolCallRes.result.jobId, "test-job-12345", "jobId korunmalı");
    assert.equal(toolCallRes.result.navigateTo, "/stock/retail-sales-report?jobId=test-job-12345", "navigateTo korunmalı");

    // b) app_router NAVIGATE olayı piEventStream'e fırlatılmış mı?
    const navStartEvent = emittedEvents.find(
      (e) =>
        e.type === "tool_execution_start" &&
        e.args?.component_id === "app_router" &&
        e.args?.action === "NAVIGATE",
    );
    assert.ok(navStartEvent, "app_router için tool_execution_start fırlatılmalı");
    assert.equal(
      navStartEvent?.args?.payload?.path,
      "/stock/retail-sales-report?jobId=test-job-12345",
      "Navigasyon hedefi doğru olmalı",
    );

    const navEndEvent = emittedEvents.find(
      (e) =>
        e.type === "tool_execution_end" &&
        e.toolCallId?.startsWith("nav_"),
    );
    assert.ok(navEndEvent, "app_router için tool_execution_end fırlatılmalı");

    // c) Router push çağrıldı mı?
    assert.equal(navigatedPath, "/stock/retail-sales-report?jobId=test-job-12345", "Router hedef URL'ye push edilmiş olmalı");

    unsubStream();
    unsubRouter();
    unsubForm();
    uiRegistry.unregister("app_router");
    uiRegistry.unregister(formCompId);
  });

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
    // 1. Temiz başlangıç
    steeringManager.clearSteering();
    steeringManager.clearFollowUp();

    assert.equal(steeringManager.hasSteering(), false);
    assert.equal(steeringManager.hasFollowUp(), false);

    // 2. Anlık araya girme (Steering) ekle
    steeringManager.steer("Dur, Kadıköy yerine Beşiktaş'ı seç!");
    assert.equal(steeringManager.hasSteering(), true);
    assert.equal(steeringManager.getSteeringQueue().length, 1);
    assert.equal(
      steeringManager.getSteeringQueue()[0].content,
      "Dur, Kadıköy yerine Beşiktaş'ı seç!",
    );

    // 3. Takip görevi (Follow-up) ekle
    steeringManager.followUp("Rapor bitince sonuçları CSV olarak indir.");
    assert.equal(steeringManager.hasFollowUp(), true);
    assert.equal(steeringManager.getFollowUpQueue().length, 1);
    assert.equal(
      steeringManager.getFollowUpQueue()[0].content,
      "Rapor bitince sonuçları CSV olarak indir.",
    );

    // 4. Kuyruktan ilk steer mesajı tüketilsin
    const nextSteer = steeringManager.popSteer();
    assert.ok(nextSteer);
    assert.equal(nextSteer.role, "user");
    assert.equal(nextSteer.content, "Dur, Kadıköy yerine Beşiktaş'ı seç!");
    assert.equal(steeringManager.hasSteering(), false);

    // 5. Steering bitince follow-up tüketilsin
    const nextFollowUp = steeringManager.popFollowUp();
    assert.ok(nextFollowUp);
    assert.equal(nextFollowUp.role, "user");
    assert.equal(nextFollowUp.content, "Rapor bitince sonuçları CSV olarak indir.");
    assert.equal(steeringManager.hasFollowUp(), false);

    // 6. Kuyruklar tamamen boşalmış olmalı
    assert.equal(steeringManager.popSteer(), undefined);
    assert.equal(steeringManager.popFollowUp(), undefined);
  });
});
