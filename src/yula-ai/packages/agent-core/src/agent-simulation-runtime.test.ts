import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  uiRegistry,
  uiEventBus,
  multiLaneScheduler,
  progressManager,
  reconciliationEngine,
  cborCodec,
  generatePKCE,
  retryWithBackoff,
  adaptivePublisher,
  pluginRegistry,
  deferredManager,
  defaultRpcTransport,
  agentUiTools,
  piEventStream,
} from './index';
import { oauthManager } from './oauth/oauth-manager';

describe('🤖 Pi Headless UI-Agent Runtime & Protocol Simülasyonu', () => {
  // Simülasyon Ortamını Hazırla
  uiRegistry.clear();
  uiEventBus.clear();

  // Test için gerekli bileşen sözleşmesi
  uiRegistry.register({
    id: 'filter_form',
    capabilities: ['SET_FIELDS'],
    actions: {
      SET_FIELDS: {
        description: 'Filtre alanlarını günceller',
        schema: z.object({
          storeId: z.string().min(1, 'storeId boş olamaz'),
          dateRange: z.string().regex(/^\d{4}-\d{2}$/, 'dateRange YYYY-MM formatında olmalıdır'),
        }),
        whenToCall: 'Kullanıcı filtre girmek istediğinde çağrılır.',
        whenNotToCall: 'Form alanları eksikken çağrılmamalıdır.',
      },
    },
  });

  uiEventBus.subscribe('filter_form', (action) => {
    if (action === 'SET_FIELDS') {
      return { success: true };
    }
    return { success: false };
  });

  it('Aşama 11: Multi-Lane Öncelikli Yürütme Kuyruğu (Interactive vs Background Lanes)', async () => {
    multiLaneScheduler.clear();

    const interactiveTask = multiLaneScheduler.enqueue('interactive', 'Kullanıcı Buton Tıklaması', async () => {
      return 'interactive_done';
    });

    const backgroundTask = multiLaneScheduler.enqueue('background', 'Arka Plan Önbellek Temizliği', async () => {
      return 'background_done';
    });

    const [resInteractive, resBg] = await Promise.all([interactiveTask, backgroundTask]);

    expect(resInteractive).toBe('interactive_done');
    expect(resBg).toBe('background_done');

    const status = multiLaneScheduler.getAllStatus();
    expect(status.interactive.completedTaskCount).toBeGreaterThanOrEqual(1);
    expect(status.background.completedTaskCount).toBeGreaterThanOrEqual(1);
  });

  it('Aşama 12: Araç İlerleme Akışı (Tool Progress Tracking & Streaming)', () => {
    const progressEvents: number[] = [];

    const unsub = progressManager.subscribe((update) => {
      progressEvents.push(update.percentage);
    });

    const reporter = progressManager.createReporter('call_csv_gen', 'EXPORT_CSV');
    reporter.report(25, 'Satırlar taranıyor...');
    reporter.report(75, 'CSV formatına dönüştürülüyor...');
    reporter.done('CSV başarıyla indirildi');

    expect(progressEvents).toEqual([25, 75, 100]);
    unsub();
  });

  it('Aşama 13: Durum Uzlaştırma & Kilitlenme Kurtarma (Reconciliation & Self-Healing)', () => {
    // Kasti olarak askıda kalmış/tamamlanmamış bir tool çağrısı simüle et
    reconciliationEngine.simulateCrashOrphan('stuck_call_test_42', 'dispatch_component_action');

    const reconcileResult = reconciliationEngine.reconcile();
    expect(reconcileResult.hasInconsistencies).toBe(true);
    expect(reconcileResult.recoveredCount).toBeGreaterThanOrEqual(1);
    expect(reconcileResult.details[0]).toContain('stuck_call_test_42');

    // Kurtarma sonrası tekrar denetlendiğinde sistemin tutarlı olduğunu doğrula
    const secondCheck = reconciliationEngine.reconcile();
    expect(secondCheck.hasInconsistencies).toBe(false);
    expect(secondCheck.recoveredCount).toBe(0);
  });

  it('Aşama 14: İkili CBOR (RFC 8949) Durum Sıkıştırma ve Snapshot Tasarrufu', () => {
    const stateSnapshot = {
      route: '/reports',
      stage: 'RESULT',
      filters: { storeId: 'Kadıköy', dateRange: '2026-09' },
      items: Array.from({ length: 20 }, (_, i) => ({ id: i, name: `Ürün ${i}`, price: i * 15 })),
    };

    const encoded = cborCodec.encode(stateSnapshot);
    expect(encoded instanceof Uint8Array).toBe(true);

    const decoded = cborCodec.decode(encoded);
    expect(decoded).toEqual(stateSnapshot);

    const sizeComparison = cborCodec.comparePayloadSizes(stateSnapshot);
    expect(sizeComparison.cborBytes).toBeLessThanOrEqual(sizeComparison.jsonBytes);
    expect(sizeComparison.formatted).toContain('Tasarruf');
  });

  it('Aşama 15: OAuth PKCE Güvenlik Protokolü & Süre Sonu Algılama', async () => {
    const pkce = await generatePKCE();
    expect(pkce.verifier.length).toBeGreaterThanOrEqual(40);
    expect(pkce.challenge.length).toBeGreaterThanOrEqual(40);

    // 1 dakika sonra bitecek bir token (varsayılan 5 dk eşiğine göre süresi dolmak üzere sayılmalı)
    const isExpiring = oauthManager.isExpiringSoon({
      type: 'oauth',
      accessToken: 'tok_live_123',
      expiresAt: Date.now() + 60_000,
    });
    expect(isExpiring).toBe(true);

    // 60 dakika sonra bitecek bir token (süresi dolmak üzere sayılmamalı)
    const isFresh = oauthManager.isExpiringSoon({
      type: 'oauth',
      accessToken: 'tok_live_123',
      expiresAt: Date.now() + 60 * 60_000,
    });
    expect(isFresh).toBe(false);
  });

  it('Aşama 16: Üstel Geri Çekilme ile Dayanıklı Yeniden Deneme (Exponential Backoff Retry)', async () => {
    let callAttempts = 0;

    const recoveredResult = await retryWithBackoff(
      async (attempt) => {
        callAttempts = attempt;
        if (attempt < 3) {
          throw new Error(`Geçici ağ hatası #${attempt}`);
        }
        return 'Bağlantı Başarılı';
      },
      {
        maxAttempts: 3,
        baseDelayMs: 10,
        backoffMultiplier: 1.5,
      }
    );

    expect(recoveredResult).toBe('Bağlantı Başarılı');
    expect(callAttempts).toBe(3);
  });

  it('Aşama 17: Adaptive Publisher 60fps Birleştirme (🌊)', async () => {
    // 15 hızlı güncellemeyi tek frame penceresinde birleştir
    for (let i = 1; i <= 15; i++) {
      adaptivePublisher.publish({ type: 'message_update', message: { role: 'assistant', content: `paket #${i}` } });
    }
    adaptivePublisher.flush();
    // flush sonrası kuyrukta bekleyen kalmamalı (ikinci flush zararsız olmalı)
    expect(() => adaptivePublisher.flush()).not.toThrow();
    adaptivePublisher.dispose();
  });

  it('Aşama 18: Plugin Kayıt / Kaldırma Döngüsü (🔌)', async () => {
    await pluginRegistry.register({
      id: 'sim_analytics_plugin',
      name: 'Satış Tahminleme Eklentisi',
      version: '1.0.0',
      description: 'Simülasyon tahmin paketi',
      skills: [
        {
          name: 'sim-predictive-analytics',
          description: 'Stok talebi tahmin kılavuzu',
          instructions: 'Geçmiş 3 aylık ortalamayı baz al.',
        },
      ],
    });
    expect(pluginRegistry.get('sim_analytics_plugin')?.id).toBe('sim_analytics_plugin');
    await pluginRegistry.unregister('sim_analytics_plugin');
    expect(pluginRegistry.get('sim_analytics_plugin')).toBeUndefined();
  });

  it('Aşama 19: Deferred Askıya Al & Uyandır (⏱️)', async () => {
    const { handle, promise } = deferredManager.createDeferred<{ downloadUrl: string }>('async_pdf_export', { format: 'PDF-A' }, 5000);
    expect(handle.status).toBe('suspended');
    expect(deferredManager.getSuspendedHandles().some((h) => h.handleId === handle.handleId)).toBe(true);
    const resumed = deferredManager.resume(handle.handleId, { downloadUrl: '/downloads/sales_2026.pdf' });
    expect(resumed).toBe(true);
    await expect(promise).resolves.toEqual({ downloadUrl: '/downloads/sales_2026.pdf' });
  });

  it('Aşama 20: JSON-RPC 2.0 execute_action & ping (🌐)', async () => {
    const ping = await defaultRpcTransport.send('ping', {});
    expect(ping.success).toBe(true);
    expect(ping.jsonrpc).toBe('2.0');

    const exec = await defaultRpcTransport.send('execute_action', {
      component_id: 'filter_form',
      action: 'SET_FIELDS',
      payload: { storeId: 'Kadıköy', dateRange: '2026-09' },
    } as any);
    expect(exec.jsonrpc).toBe('2.0');
    expect(exec.success).toBe(true);

    const bad = await defaultRpcTransport.send('execute_action', {
      component_id: 'filter_form',
      action: 'SET_FIELDS',
      payload: { storeId: '', dateRange: 'hatalı' },
    } as any);
    expect(bad.success).toBe(false);
    expect(bad.error?.code).toBe(-32001);
  });

  it('Aşama 21: Hibrit Seçenek Sunma Aracı (ask_user_choice & Pi Event) (🎯)', async () => {
    let capturedPiEvent: any = null;
    const unsub = piEventStream.subscribe((event) => {
      if (event.type === 'user_choice_prompt') {
        capturedPiEvent = event;
      }
    });

    const choiceTool = agentUiTools.ask_user_choice;
    expect(choiceTool).toBeDefined();

    const result = await (choiceTool as any).execute({
      question: 'Hangi mağaza için rapor hazırlayayım?',
      options: [
        { label: 'Kadıköy', value: 'Kadıköy-101', description: 'Ana şube' },
        { label: 'Beşiktaş', value: 'Beşiktaş-202' },
        'Üsküdar',
      ],
      allow_custom: true,
    });

    unsub();

    expect(result.success).toBe(true);
    expect(result.status).toBe('waiting_user_selection');
    expect(result.options).toHaveLength(3);
    expect(result.options[0]).toEqual({ label: 'Kadıköy', value: 'Kadıköy-101', description: 'Ana şube' });
    expect(result.options[2]).toEqual({ label: 'Üsküdar', value: 'Üsküdar', description: undefined });

    // Pi EventStream yayınını doğrula
    expect(capturedPiEvent).not.toBeNull();
    expect(capturedPiEvent.question).toBe('Hangi mağaza için rapor hazırlayayım?');
    expect(capturedPiEvent.options).toHaveLength(3);

    // Ring buffer telemetri kaydını doğrula
    const recentTelemetries = uiEventBus.getRecentEvents();
    const promptTelemetry = recentTelemetries.find((t) => t.type === 'USER_CHOICE_PROMPT');
    expect(promptTelemetry).toBeDefined();
    expect(promptTelemetry?.payload.question).toBe('Hangi mağaza için rapor hazırlayayım?');
  });
});
