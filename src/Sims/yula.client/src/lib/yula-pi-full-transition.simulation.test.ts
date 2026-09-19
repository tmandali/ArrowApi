import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  uiRegistry,
  uiEventBus,
  executeComponentAction,
  type ComponentSchema,
  hookPipeline,
  steeringManager,
  truncateContent,
  mutationLine,
  adaptivePublisher,
  AdaptivePublisher,
  retryWithBackoff,
  agentMemory,
  multiLaneScheduler,
  deferredManager,
  reconciliationEngine,
  piEventStream,
} from "@my-agent/core";
import {
  stockPredictiveAnalyticsPlugin,
  registerDefaultYulaPlugins,
} from "@/lib/plugins/yula-plugins";
import { pingRpc, sendRpcAction } from "@/lib/rpc/yula-rpc-client";

describe("⚡ Yula Client — Pi Tam Geçiş (14 Yetenek Doğrulama Testi)", () => {
  beforeEach(() => {
    uiRegistry.clear();
    uiEventBus.clear();
    steeringManager.clearSteering();
    steeringManager.clearFollowUp();
  });

  // 1. ✍️ SET_FIELDS (Kadıköy/2026-09)
  it("1. SET_FIELDS eylemi kriter formuna parametreleri hatasız uygulamalıdır", async () => {
    let appliedCriteria: any = null;

    const schema: ComponentSchema = {
      id: "criteria_form:retail-sales-report",
      actions: {
        SET_FIELDS: {
          description: "Populates criteria",
        },
      },
    };
    uiRegistry.register(schema);

    const unsub = uiEventBus.subscribe("criteria_form:retail-sales-report", (action, payload) => {
      if (action === "SET_FIELDS") {
        appliedCriteria = payload;
        return { success: true, criteria: payload };
      }
      return { success: false };
    });

    const res = await executeComponentAction({
      component_id: "criteria_form:retail-sales-report",
      action: "SET_FIELDS",
      payload: { storeId: "Kadıköy", dateRange: "2026-09" },
    });

    assert.equal(res.success, true);
    assert.deepEqual(appliedCriteria, { storeId: "Kadıköy", dateRange: "2026-09" });
    unsub();
  });

  // 2. 🚀 SUBMIT (HITL Onayı İster)
  it("2. SUBMIT eylemi hookPipeline üzerinden Human-in-the-Loop onayı istemeli ve reddedilirse engellenmelidir", async () => {
    let approvalRequested = false;

    const schema: ComponentSchema = {
      id: "criteria_form:retail-sales-report",
      actions: {
        SUBMIT: { description: "Executes report" },
      },
    };
    uiRegistry.register(schema);

    // HITL interceptor kancasını bağla
    const unsubHook = hookPipeline.beforeToolCall(async (ctx) => {
      if (ctx.args?.action === "SUBMIT") {
        approvalRequested = true;
        // Kullanıcının reddettiğini simüle et
        return {
          block: {
            reason: "Kullanıcı onayı reddetti (Human-in-the-Loop Engellemesi)",
            terminate: true,
          },
        };
      }
      return {};
    });

    const res = await executeComponentAction({
      component_id: "criteria_form:retail-sales-report",
      action: "SUBMIT",
      payload: {},
    });

    assert.equal(approvalRequested, true, "HITL onayı istenmiş olmalı");
    assert.equal(res.success, false, "Reddedilince eylem başarısız dönmeli");
    assert.match(res.error || "", /Human-in-the-Loop Engellemesi/);

    unsubHook();
  });

  // 3. ⚡ Steer (Araya Gir)
  it("3. Steer araya girme mesajı enjekte edilip öncelikle tüketilmelidir", () => {
    steeringManager.clearSteering();
    assert.equal(steeringManager.hasSteering(), false);

    steeringManager.steer("Durdur! Kadıköy yerine Beşiktaş'ı seç.");
    assert.equal(steeringManager.hasSteering(), true);
    assert.equal(steeringManager.getSteeringQueue().length, 1);

    const popped = steeringManager.popSteer();
    assert.equal(popped?.content, "Durdur! Kadıköy yerine Beşiktaş'ı seç.");
    assert.equal(steeringManager.hasSteering(), false);
  });

  // 4. 📥 Follow-up (Takip İşi)
  it("4. Follow-up takip işi kuyruğa alınıp tur bitiminde sırayla tüketilmelidir", () => {
    steeringManager.clearFollowUp();
    assert.equal(steeringManager.hasFollowUp(), false);

    steeringManager.followUp("Rapor bittikten sonra sonuçları Excel olarak dışa aktar.");
    assert.equal(steeringManager.hasFollowUp(), true);

    const nextJob = steeringManager.popFollowUp();
    assert.equal(nextJob?.content, "Rapor bittikten sonra sonuçları Excel olarak dışa aktar.");
    assert.equal(steeringManager.hasFollowUp(), false);
  });

  // 5. ✂️ Dual-Bound Truncation
  it("5. Dual-Bound Truncation büyük çıktıları hem satır hem bayt sınırıyla güvenle budamalıdır", () => {
    const hugeData = Array.from({ length: 500 }, (_, i) => `Satır ${i + 1}: SKU-PROD-${i * 1234}`).join("\n");
    const result = truncateContent(hugeData, { maxLines: 10, maxBytes: 400 });

    assert.equal(result.truncated, true);
    assert.ok(result.content.includes("[Pi Token Guard:"));
    assert.ok(result.content.split("\n").length <= 15);
  });

  // 6. ⛓️ Mutation Line (Atomik)
  it("6. Mutation Line işlemleri sıralı (FIFO) ve yarış durumsuz yürütmelidir", async () => {
    const executedOrder: number[] = [];

    await Promise.all([
      mutationLine.enqueue(async () => {
        await new Promise((r) => setTimeout(r, 20));
        executedOrder.push(1);
      }),
      mutationLine.enqueue(async () => {
        await new Promise((r) => setTimeout(r, 5));
        executedOrder.push(2);
      }),
      mutationLine.enqueue(async () => {
        executedOrder.push(3);
      }),
    ]);

    assert.deepEqual(executedOrder, [1, 2, 3], "İşlemler çağrılma sırasıyla tamamlanmalı");
  });

  // 7. 🌊 Adaptive Publisher (60fps)
  it("7. Adaptive Publisher yüksek hızlı olayları tek frame penceresinde birleştirmelidir", () => {
    let publishedCount = 0;
    const publisher = new AdaptivePublisher<any>({
      publish: () => {
        publishedCount++;
      },
      minIntervalMs: 16,
    });

    for (let i = 1; i <= 10; i++) {
      publisher.publish({ type: "stream_chunk", index: i });
    }

    publisher.flush();
    assert.ok(publishedCount <= 2, "10 mikro-olay en fazla 2 emisyonda (1 anlık + 1 toplu) birleştirilmiş olmalı");
    publisher.dispose();

    // Global adaptivePublisher da test edilsin
    assert.doesNotThrow(() => {
      adaptivePublisher.publish({ type: "test_event" });
      adaptivePublisher.flush();
    });
  });

  // 8. 🔁 Retry (Backoff ile)
  it("8. retryWithBackoff geçici hatalardan sonra isteği başarıyla kurtarmalıdır", async () => {
    let attempts = 0;

    const result = await retryWithBackoff(
      async () => {
        attempts++;
        if (attempts < 3) {
          throw new Error("Ağ zaman aşımı (503)");
        }
        return "200 OK";
      },
      { maxRetries: 3, initialDelayMs: 10, backoffMultiplier: 1.5 },
    );

    assert.equal(attempts, 3);
    assert.equal(result, "200 OK");
  });

  // 9. 🧠 Memory (Kalıcı Tercih)
  it("9. agentMemory hem session hem de persistent tercihi saklayıp geri çağırmalıdır", () => {
    agentMemory.remember("preferred_warehouse", "Ana Depo - Gebze", "session", "Kullanıcı varsayılan deposu");
    const recalled = agentMemory.recall("preferred_warehouse");
    assert.equal(recalled, "Ana Depo - Gebze");
  });

  // 10. 🔌 Plugin (Tahminleme Modülü)
  it("10. Plugin Registry eklentiyi ve sağladığı araçları başarıyla kaydetmelidir", async () => {
    await registerDefaultYulaPlugins();

    const tool = (stockPredictiveAnalyticsPlugin as any).tools?.forecast_stock_demand;
    assert.ok(tool, "Eklenti tool'u tanımlı olmalı");

    const forecast = await tool.execute({ storeId: "Kadıköy" });
    assert.equal(forecast.success, true);
    assert.equal(forecast.storeId, "Kadıköy");
    assert.equal(forecast.expectedDemandGrowth, "+8.4%");
  });

  // 11. 🛤️ Multi-Lane (Sohbet + Arka Plan)
  it("11. Multi-Lane Scheduler interactive ve background şeritlerini yönetmelidir", async () => {
    const laneExecutions: string[] = [];

    await Promise.all([
      multiLaneScheduler.enqueue("background", "Arka Plan Vektör İndeksleme", async () => {
        await new Promise((r) => setTimeout(r, 15));
        laneExecutions.push("background-done");
      }),
      multiLaneScheduler.enqueue("interactive", "Kullanıcı Chat Yanıtı", async () => {
        laneExecutions.push("interactive-done");
      }),
    ]);

    assert.ok(laneExecutions.includes("interactive-done"));
    assert.ok(laneExecutions.includes("background-done"));
  });

  // 12. ⏱️ Deferred (Askıya Al & Uyandır)
  it("12. deferredManager görevi askıya alıp resume ile başarıyla uyandırmalıdır", async () => {
    // 12a. handleId veya jobId üzerinden uyandırma doğrulaması
    const jobId = "91878cab-3a25-40e9-852d-e86aa2c672c5";
    const { handle, promise } = deferredManager.createDeferred(jobId, { jobId }, 5000, jobId);

    assert.equal(handle.status, "suspended");
    assert.equal(handle.handleId, jobId);

    // Asenkron bir işlem bitince jobId ile uyandır
    setTimeout(() => {
      deferredManager.resume(jobId, { totalRows: 450, file: "report.parquet" });
    }, 20);

    const outcome = await promise;
    assert.deepEqual(outcome, { totalRows: 450, file: "report.parquet" });

    // 12b. Güvenli zaman aşımı (safe timeout) testi
    let timedOutEventFired = false;
    const unsub = piEventStream.subscribe((ev) => {
      if (ev.type === "task_timed_out" && ev.taskId === "quick_timeout_job") {
        timedOutEventFired = true;
      }
    });

    const timeoutDeferred = deferredManager.createDeferred(
      "quick_timeout_job",
      { jobId: "quick_timeout_job" },
      30, // 30ms hızlı zaman aşımı
      "quick_timeout_job"
    );

    let errorCaught = false;
    timeoutDeferred.promise.catch((err) => {
      errorCaught = true;
      assert.ok(err.message.includes("zaman aşımına uğradı"));
    });

    await new Promise((r) => setTimeout(r, 60));
    unsub();

    assert.equal(errorCaught, true, "Zaman aşımı hatası unhandled rejection yerine catch ile güvenle yakalanmalı");
    assert.equal(timedOutEventFired, true, "piEventStream üzerinden task_timed_out olayı fırlatılmalı");
  });


  // 13. 🔄 Reconcile (Kilitlenme Kurtarma)
  it("13. reconciliationEngine oturumu denetleyip durum raporu üretmelidir", () => {
    const report = reconciliationEngine.reconcile();
    assert.ok(typeof report.message === "string");
    assert.ok(Array.isArray(report.details));
  });

  // 14. 🌐 Remote RPC (JSON-RPC 2.0)
  it("14. defaultRpcTransport JSON-RPC 2.0 ping ve execute_action mesajlaşmasını sağlamalıdır", async () => {
    const isAlive = await pingRpc();
    assert.equal(isAlive, true, "RPC ping başarılı olmalı");

    // app_router bileşenini kaydet
    const routerSchema: ComponentSchema = {
      id: "app_router",
      actions: {
        NAVIGATE: { description: "Navigates between pages" },
      },
    };
    uiRegistry.register(routerSchema);

    let navigated = false;
    const unsub = uiEventBus.subscribe("app_router", (action) => {
      if (action === "NAVIGATE") {
        navigated = true;
        return { success: true };
      }
      return { success: false };
    });

    const response = await sendRpcAction("app_router", "NAVIGATE", { path: "/stock" });
    assert.equal(response.jsonrpc, "2.0");
    assert.equal(response.success, true);
    assert.equal(navigated, true);

    unsub();
  });

  // 15. 🎭 Uçtan Uca Entegre Akış Simülasyonu
  it("15. Uçtan Uca Simülasyon: SET_FIELDS -> Inline HITL Seçimi -> Onay -> SUBMIT -> Deferred Suspend & SSE Resume -> Background İndeksleme", async () => {
    // 1. Durum izleyicileri
    const auditSteps: string[] = [];
    let formCriteria: any = null;
    let jobExecutionResult: any = null;
    let backgroundIndexCompleted = false;

    // 2. Kriter form bileşenini kaydet
    const formSchema: ComponentSchema = {
      id: "criteria_form:retail-sales-report",
      actions: {
        SET_FIELDS: { description: "Populates criteria" },
        SUBMIT: { description: "Executes report" },
      },
    };
    uiRegistry.register(formSchema);

    const unsubForm = uiEventBus.subscribe("criteria_form:retail-sales-report", async (action, payload) => {
      if (action === "SET_FIELDS") {
        formCriteria = payload;
        auditSteps.push("1. FORM_FIELDS_SET");
        return { success: true, criteria: payload };
      }
      if (action === "SUBMIT") {
        auditSteps.push("3. FORM_SUBMITTED");
        // Deferred görev aç
        const jobId = "job_simulation_kadikoy_001";
        const { handle, promise } = deferredManager.createDeferred(jobId, { criteria: formCriteria }, 5000);
        
        // Asenkron SSE akışını simüle et (25ms sonra backend tamamlar)
        setTimeout(() => {
          deferredManager.resume(handle.handleId, {
            jobId,
            status: "Completed",
            totalRows: 1850,
            table: "retail_sales_report_result",
          });
        }, 25);

        // Arka plan DuckDB RAG indekslemesini multiLaneScheduler'a devret
        multiLaneScheduler.enqueue("background", "DuckDB RAG İndeksleme", async () => {
          backgroundIndexCompleted = true;
          auditSteps.push("5. BACKGROUND_RAG_INDEXED");
          return { indexed: true };
        });

        const jobResult = await promise;
        jobExecutionResult = jobResult;
        auditSteps.push("4. DEFERRED_JOB_RESUMED");
        return { success: true, result: jobResult };
      }
      return { success: false };
    });

    // 3. Adım 1: Ajan SET_FIELDS eylemini yürütür
    const setFieldsRes = await executeComponentAction({
      component_id: "criteria_form:retail-sales-report",
      action: "SET_FIELDS",
      payload: { store: "Kadıköy", period: "2026-09" },
    });
    assert.equal(setFieldsRes.success, true);
    assert.deepEqual(formCriteria, { store: "Kadıköy", period: "2026-09" });

    // 4. Adım 2: Ajan akış içi inline onay sorusu sorar (ask_user_choice simülasyonu)
    const userChoicePrompt = {
      type: "ask_user_choice",
      question: "Kadıköy mağazası için Eylül 2026 raporunu çalıştırmak istiyor musunuz?",
      options: ["Evet, Raporu Çalıştır", "Hayır, Vazgeç"],
    };
    assert.ok(userChoicePrompt.options.includes("Evet, Raporu Çalıştır"));
    auditSteps.push("2. INLINE_HITL_CONFIRMED");

    // 5. Adım 3: Kullanıcı 'Evet, Raporu Çalıştır' dediğinde SUBMIT tetiklenir
    const submitRes = await executeComponentAction({
      component_id: "criteria_form:retail-sales-report",
      action: "SUBMIT",
      payload: { confirmedBy: "user_choice" },
    });
    assert.equal(submitRes.success, true);

    // 6. Arka plan şeridinin tamamlanmasını bekle
    await new Promise((resolve) => setTimeout(resolve, 60));

    // 7. Doğrulamalar
    assert.equal(backgroundIndexCompleted, true, "Arka plan RAG şeridi tamamlanmalıdır");
    assert.equal(jobExecutionResult.status, "Completed");
    assert.equal(jobExecutionResult.totalRows, 1850);
    assert.ok(auditSteps.includes("1. FORM_FIELDS_SET"));
    assert.ok(auditSteps.includes("2. INLINE_HITL_CONFIRMED"));
    assert.ok(auditSteps.includes("3. FORM_SUBMITTED"));
    assert.ok(auditSteps.includes("4. DEFERRED_JOB_RESUMED"));
    assert.ok(auditSteps.includes("5. BACKGROUND_RAG_INDEXED"));

    unsubForm();
    uiRegistry.unregister("criteria_form:retail-sales-report");
  });
});


