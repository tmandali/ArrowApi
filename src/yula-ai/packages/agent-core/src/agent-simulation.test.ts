import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  uiRegistry,
  uiEventBus,
  executeComponentAction,
  hookPipeline,
  sessionManager,
  Agent,
  AgentSession,
  telemetryTracker,
  truncateContent,
  mutationLine,
  agentMemory,
  agentUiTools,
  skillsManager,
  evalRunner,
  defaultUiAgentEvalSuite,
  createAgentToolsForServer,
} from './index';
import {
  resolveProviderAndModel,
  parseModelsFile,
  getAvailableModels,
} from './server/models-config';

describe('🤖 Pi Headless UI-Agent Uçtan Uca Simülasyonu', () => {
  // Simülasyon Ortamını Hazırla
  uiRegistry.clear();
  uiEventBus.clear();
  agentMemory.clear();
  telemetryTracker.reset();
  sessionManager.reset();

  // 1. Bileşenleri Kaydet
  uiRegistry.register({
    id: 'filter_form',
    capabilities: ['SET_FIELDS', 'SUBMIT'],
    actions: {
      SET_FIELDS: {
        description: 'Filtre alanlarını günceller',
        schema: z.object({
          storeId: z.string().min(1, 'storeId boş olamaz'),
          dateRange: z.string().regex(/^\d{4}-\d{2}$/, 'dateRange YYYY-MM formatında olmalıdır'),
        }),
        whenToCall: 'Kullanıcı mağaza veya tarih filtresi girmek istediğinde çağrılır.',
        whenNotToCall: 'Form alanları eksikken veya salt soru sorulduğunda SUBMIT çağrılmamalıdır.',
      },
      SUBMIT: {
        description: 'Raporu çalıştırır',
        schema: z.object({}),
        whenToCall: 'Form alanları doluyken rapor çalıştırmak için çağrılır.',
        whenNotToCall: 'Form alanları eksikken çağrılmamalıdır.',
      },
    },
    meta: {
      description: 'Satış raporu filtre formu.',
    },
  });

  uiRegistry.register({
    id: 'result_table',
    capabilities: ['SORT', 'EXPORT_CSV'],
    actions: {
      SORT: {
        description: 'Sonuç tablosunu sıralar',
        schema: z.object({ direction: z.enum(['asc', 'desc']) }),
        whenToCall: 'Sonuç tablosu sıralanmak veya dışa aktarılmak istendiğinde çağrılır.',
        whenNotToCall: 'Rapor henüz çalıştırılmamışken çağrılmamalıdır.',
      },
      EXPORT_CSV: {
        description: 'CSV dışa aktarır',
        schema: z.object({}),
        whenToCall: 'Kullanıcı CSV çıktısı istediğinde çağrılır.',
        whenNotToCall: 'Rapor çalıştırılmamışken çağrılmamalıdır.',
      },
    },
    meta: {
      description: 'Dinamik sonuç tablosu.',
    },
  });

  uiRegistry.register({
    id: 'app_router',
    capabilities: ['NAVIGATE', 'BACK'],
    actions: {
      NAVIGATE: {
        description: 'Sayfaya yönlendirir',
        schema: z.object({ path: z.string() }),
        whenToCall: 'Kullanıcı rota değiştirmek istediğinde çağrılır.',
        whenNotToCall: 'Zaten hedef sayfadayken çağrılmamalıdır.',
      },
      BACK: {
        description: 'Önceki sayfaya döner',
        schema: z.object({}),
        whenToCall: 'Geri gitmek istendiğinde çağrılır.',
        whenNotToCall: 'Başlangıç sayfasındayken çağrılmamalıdır.',
      },
    },
    meta: {
      description: 'Ekranlar arası yönlendirici.',
    },
  });

  uiRegistry.register({
    id: 'dashboard_kpi',
    capabilities: ['FILTER_REGION', 'REFRESH_DATA'],
    meta: {
      description: 'Dashboard KPI kartları.',
    },
  });

  let simulatedUiState = {
    storeId: '',
    dateRange: '',
    stage: 'CRITERIA',
    currentRoute: '/',
  };

  uiEventBus.subscribe('filter_form', (action, payload) => {
    if (action === 'SET_FIELDS') {
      if (payload?.storeId) simulatedUiState.storeId = payload.storeId;
      if (payload?.dateRange) simulatedUiState.dateRange = payload.dateRange;
      if (simulatedUiState.currentRoute !== '/reports') {
        simulatedUiState.currentRoute = '/reports';
      }
      return { success: true };
    }
    if (action === 'SUBMIT') {
      if (simulatedUiState.currentRoute !== '/reports') {
        simulatedUiState.currentRoute = '/reports';
      }
      simulatedUiState.stage = 'RESULT';
      return { success: true };
    }
    return { success: true };
  });

  uiEventBus.subscribe('result_table', (action, payload) => {
    return { success: true, action, payload };
  });

  uiEventBus.subscribe('app_router', (action, payload) => {
    if (action === 'NAVIGATE') simulatedUiState.currentRoute = payload.path;
    return { success: true };
  });

  uiEventBus.subscribe('dashboard_kpi', () => {
    return { success: true };
  });

  it('Aşama 1: Zod Preflight Doğrulaması ve Kendi Kendini Onarma (Self-Healing)', async () => {
    // Kasti hatalı format (YYYY/MM/DD) gönderiyoruz
    const invalidRes = await executeComponentAction({
      component_id: 'filter_form',
      action: 'SET_FIELDS',
      payload: { storeId: 'Kadıköy', dateRange: '2026/09/15' },
    });

    expect(invalidRes.success).toBe(false);
    expect(invalidRes.error).toContain('Zod Validasyon Hatası');

    // Ajan hatayı okur ve doğru formatla tekrar çağırır (Self-Healing)
    const validRes = await executeComponentAction({
      component_id: 'filter_form',
      action: 'SET_FIELDS',
      payload: { storeId: 'Kadıköy', dateRange: '2026-09' },
    });

    expect(validRes.success).toBe(true);
    // Ana sayfadan ('/') çağrıldığında otomatik olarak '/reports' sayfasına geçilmiş olmalı
    expect(simulatedUiState.currentRoute).toBe('/reports');
    expect(simulatedUiState.storeId).toBe('Kadıköy');
    expect(simulatedUiState.dateRange).toBe('2026-09');
    sessionManager.checkpoint('Filtreler Girildi', simulatedUiState);
  });

  it('Aşama 2: Human-in-the-Loop (HITL) beforeToolCall Onay Döngüsü', async () => {
    let hitlPrompted = false;

    const unsub = hookPipeline.beforeToolCall(async (ctx) => {
      if (ctx.toolName === 'dispatch_component_action' && ctx.args?.action === 'SUBMIT') {
        hitlPrompted = true;
        // Simülasyon onayı: kullanıcı işlemi onaylıyor (bloklanmıyor)
        return {};
      }
      return {};
    });

    const submitRes = await executeComponentAction({
      component_id: 'filter_form',
      action: 'SUBMIT',
      payload: {},
    });

    expect(hitlPrompted).toBe(true);
    expect(submitRes.success).toBe(true);
    simulatedUiState.stage = 'RESULT';
    sessionManager.checkpoint('Rapor Oluşturuldu', simulatedUiState);
    unsub();
  });

  it('Aşama 3: Steering (Araya Girme) ve Follow-up (Takip İşi) Kuyruğu (Pure Pi AgentSession)', async () => {
    const session = new AgentSession({
      agent: new Agent({
        tools: [],
        streamFn: async () => ({
          message: { role: 'assistant', content: '' },
          toolCalls: [],
        }),
      }),
    });
    session.clear();

    // Kullanıcı araya girer
    session.steer('Durdur! Kadıköy yerine Beşiktaş mağazasını seç.');
    expect(session.hasSteering()).toBe(true);

    const steerMsg = session.popSteer()?.content;
    expect(steerMsg).toContain('Beşiktaş');
    expect(session.hasSteering()).toBe(false);

    // Follow-up ekleme
    session.followUp('Rapor bitince CSV indir.');
    expect(session.hasFollowUp()).toBe(true);
    const followUpMsg = session.popFollowUp()?.content;
    expect(followUpMsg).toContain('CSV indir');
    expect(session.hasFollowUp()).toBe(false);
  });

  it('Aşama 4: Dual-Bound Truncation (Çift Yönlü Güvenli Kesme)', () => {
    const hugeOutput = Array.from({ length: 500 }, (_, i) => `Satır ${i}: Veri kaydı ${Math.random()}`).join('\n');
    const truncated = truncateContent(hugeOutput, { maxLines: 10, maxBytes: 500 });

    expect(truncated.truncated).toBe(true);
    expect(truncated.content.split('\n').length).toBeLessThanOrEqual(12);
    expect(truncated.content).toContain('Pi Token Guard');
  });

  it('Aşama 5: MutationLine ile Atomik Sıralı Mutasyon', async () => {
    const sequence: number[] = [];

    await Promise.all([
      mutationLine.enqueue(async () => {
        sequence.push(1);
      }),
      mutationLine.enqueue(async () => {
        sequence.push(2);
      }),
      mutationLine.enqueue(async () => {
        sequence.push(3);
      }),
    ]);

    expect(sequence).toEqual([1, 2, 3]);
  });

  it('Aşama 6: Zaman Yolculuğu (Time-Travel Undo / Redo)', () => {
    expect(sessionManager.canUndo()).toBe(true);

    // Bir adım geri al (Filtreler Girildi durumuna)
    const undoCheckpoint = sessionManager.undo();
    expect(undoCheckpoint?.label).toBe('Filtreler Girildi');

    // İleri sar (Rapor Oluşturuldu durumuna)
    const redoCheckpoint = sessionManager.redo();
    expect(redoCheckpoint?.label).toBe('Rapor Oluşturuldu');
  });

  it('Aşama 7: Pi 10 Senaryolu E2E Eval Benchmark Paketi (100% Başarı)', async () => {
    const suiteResult = await evalRunner.runSuite(defaultUiAgentEvalSuite, async (prompt) => {
      const lower = prompt.toLowerCase();
      const actions: { componentId: string; action: string; payload?: any }[] = [];

      if (lower.includes('dashboard') && (lower.includes('götür') || lower.includes('git'))) {
        actions.push({ componentId: 'app_router', action: 'NAVIGATE', payload: { path: '/dashboard' } });
      }
      if (lower.includes('kadıköy')) {
        actions.push({ componentId: 'filter_form', action: 'SET_FIELDS', payload: { storeId: 'Kadıköy' } });
      }
      if (lower.includes('azalan') || lower.includes('sırala')) {
        actions.push({ componentId: 'result_table', action: 'SORT', payload: { direction: 'desc' } });
      }
      if (lower.includes('csv') || lower.includes('excel')) {
        actions.push({ componentId: 'result_table', action: 'EXPORT_CSV' });
      }
      if (lower.includes('geri dön')) {
        actions.push({ componentId: 'app_router', action: 'BACK' });
      }
      if (lower.includes('bölge') || lower.includes('marmara')) {
        actions.push({ componentId: 'dashboard_kpi', action: 'FILTER_REGION', payload: { region: 'Marmara' } });
      }
      if (lower.includes('tazele') || lower.includes('güncelle')) {
        actions.push({ componentId: 'dashboard_kpi', action: 'REFRESH_DATA' });
      }

      return {
        dispatchedActions: actions,
        responseMessage: 'Simülasyon yanıtı.',
      };
    });

    expect(suiteResult.total).toBe(10);
    expect(suiteResult.passed).toBe(10);
    expect(suiteResult.failed).toBe(0);
    expect(suiteResult.passRate).toBe(100);
  });

  it('Aşama 8: Telemetri & Dinamik Model Maliyet Hesaplama (agnes-3.0-flash)', () => {
    telemetryTracker.reset();
    telemetryTracker.setModelPricing(0.15, 0.60); // agnes-3.0-flash tarifesi

    telemetryTracker.startTurn();
    telemetryTracker.recordToolExecution('dispatch_component_action', true, 120);

    // 10,000 prompt token ($0.0015) + 2,000 completion token ($0.0012) = $0.0027
    const metric = telemetryTracker.endTurn(10_000, 2_000);

    expect(metric.totalTokens).toBe(12_000);
    expect(metric.estimatedCostUsd).toBeCloseTo(0.0027, 4);
    expect(metric.toolsSuccessRate).toBe(100);
  });

  it('Aşama 9: Standart Ajan Araçları ve Hafıza CRUD Yönetimi (Memory & Tools)', async () => {
    agentMemory.clear();

    // 1. inspect_ui_state aracını çalıştır
    const inspectResult: any = await (agentUiTools.inspect_ui_state as any).execute({});
    expect(inspectResult.success).toBe(true);
    expect(inspectResult.active_components.length).toBeGreaterThanOrEqual(1);

    // 2. remember_fact aracını çalıştır
    const rememberResult: any = await (agentUiTools.remember_fact as any).execute({
      key: 'preferred_store',
      value: 'Kadıköy',
      scope: 'session',
      description: 'Varsayılan mağaza tercihi',
    });
    expect(rememberResult.success).toBe(true);
    expect(agentMemory.recall('preferred_store')).toBe('Kadıköy');

    // 3. recall_fact aracını çalıştır
    const recallResult: any = await (agentUiTools.recall_fact as any).execute({ key: 'preferred_store' });
    expect(recallResult.success).toBe(true);
    expect(recallResult.value).toBe('Kadıköy');

    // 4. forget_fact aracını çalıştır
    const forgetResult: any = await (agentUiTools.forget_fact as any).execute({ key: 'preferred_store' });
    expect(forgetResult.success).toBe(true);
    expect(agentMemory.recall('preferred_store')).toBeUndefined();
  });

  it('Aşama 10: Modüler Beceri (Skills) ve Rota/Bileşen Kılavuzu', () => {
    // /reports rotasında filter_form bileşeni için geçerli yetenekleri çek
    const activeSkills = skillsManager.getActiveSkills('/reports', ['filter_form']);
    expect(activeSkills.length).toBeGreaterThanOrEqual(1);
    expect(activeSkills.some((s) => s.name === 'form-submission-guide')).toBe(true);

    // LLM sistem promptu için formatlanmış XML çıktısını al
    const promptXml = skillsManager.formatSkillsPrompt('/reports', ['filter_form']);
    expect(promptXml).toContain('<available_ui_skills>');
    expect(promptXml).toContain('form-submission-guide');

    // Progressive disclosure summary çıktısını test et
    const summaryXml = skillsManager.formatSkillsSummaryPrompt('/reports', ['filter_form']);
    expect(summaryXml).toContain('<available_ui_skills>');
    expect(summaryXml).toContain('form-submission-guide');
    expect(summaryXml).toContain('read_skill_guide');
  });
});
