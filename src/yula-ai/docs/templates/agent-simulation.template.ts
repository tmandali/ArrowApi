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
  skillsManager,
  multiLaneScheduler,
  progressManager,
  reconciliationEngine,
  cborCodec,
  retryWithBackoff,
} from '@my-agent/core';

describe('🤖 Headless UI-Agent Uçtan Uca Simülasyonu', () => {
  // Ortamı Sıfırla
  uiRegistry.clear();
  uiEventBus.clear();
  agentMemory.clear();
  sessionManager.reset();

  // 1. Test Bileşeni Kaydı
  uiRegistry.register({
    id: 'filter_form',
    actions: {
      SET_FIELDS: {
        schema: z.object({
          storeId: z.string().min(1),
          dateRange: z.string().regex(/^\d{4}-\d{2}$/),
        }),
        whenToCall: 'Filtre girmek için çağrılır.',
        whenNotToCall: 'Form doluyken tekrar çağrılmamalıdır.',
      },
      SUBMIT: {
        schema: z.object({}),
        whenToCall: 'Raporu çalıştırmak için çağrılır.',
        whenNotToCall: 'Filtreler eksikken çağrılmamalıdır.',
      },
    },
  });

  uiEventBus.subscribe('filter_form', (action) => ({ success: true, action }));

  it('Aşama 1: Zod Preflight ve Kendi Kendini Onarma (Self-Healing)', async () => {
    const badRes = await executeComponentAction({
      component_id: 'filter_form',
      action: 'SET_FIELDS',
      payload: { storeId: 'Kadıköy', dateRange: '2026/09/15' },
    });
    expect(badRes.success).toBe(false);

    const okRes = await executeComponentAction({
      component_id: 'filter_form',
      action: 'SET_FIELDS',
      payload: { storeId: 'Kadıköy', dateRange: '2026-09' },
    });
    expect(okRes.success).toBe(true);
  });

  it('Aşama 2: Human-in-the-Loop (HITL) beforeToolCall Onay Döngüsü', async () => {
    let prompted = false;
    const unsub = hookPipeline.beforeToolCall(async (ctx) => {
      if (ctx.args?.action === 'SUBMIT') {
        prompted = true;
        return {};
      }
      return {};
    });

    const res = await executeComponentAction({ component_id: 'filter_form', action: 'SUBMIT' });
    expect(prompted).toBe(true);
    expect(res.success).toBe(true);
    unsub();
  });

  it('Aşama 3: Steering (Araya Girme) ve Follow-up Kuyruğu', () => {
    const session = new AgentSession({ agent: new Agent({ tools: [] }) });
    session.clear();
    session.steer('Kadıköy yerine Beşiktaş seç.');
    expect(session.hasSteering()).toBe(true);
    expect(session.popSteer()?.content).toContain('Beşiktaş');
  });

  it('Aşama 4: Dual-Bound Truncation (Token Guard)', () => {
    const huge = Array.from({ length: 500 }, (_, i) => `Satır ${i}`).join('\n');
    const truncated = truncateContent(huge, { maxLines: 10, maxBytes: 500 });
    expect(truncated.truncated).toBe(true);
  });

  it('Aşama 5: MutationLine Atomik Sıralama', async () => {
    const seq: number[] = [];
    await Promise.all([
      mutationLine.enqueue(async () => { seq.push(1); }),
      mutationLine.enqueue(async () => { seq.push(2); }),
    ]);
    expect(seq).toEqual([1, 2]);
  });

  it('Aşama 6: Zaman Yolculuğu (Undo / Redo)', () => {
    sessionManager.checkpoint('Durum 1', { step: 1 });
    sessionManager.checkpoint('Durum 2', { step: 2 });
    expect(sessionManager.undo()?.label).toBe('Durum 1');
    expect(sessionManager.redo()?.label).toBe('Durum 2');
  });

  it('Aşama 7: Telemetri & Token Maliyet Hesaplama', () => {
    telemetryTracker.reset();
    telemetryTracker.setModelPricing(0.15, 0.60);
    telemetryTracker.startTurn();
    telemetryTracker.recordToolExecution('dispatch_component_action', true, 50);
    const metric = telemetryTracker.endTurn(10_000, 2_000);
    expect(metric.estimatedCostUsd).toBeCloseTo(0.0027, 4);
  });

  it('Aşama 8: Ajan Hafıza CRUD (Memory)', async () => {
    agentMemory.remember('store', 'Kadıköy', 'session');
    expect(agentMemory.recall('store')).toBe('Kadıköy');
    agentMemory.forget('store');
    expect(agentMemory.recall('store')).toBeUndefined();
  });

  it('Aşama 9: Multi-Lane Öncelikli Yürütme Kuyruğu', async () => {
    multiLaneScheduler.clear();
    const res = await multiLaneScheduler.enqueue('interactive', 'Test', async () => 'done');
    expect(res).toBe('done');
  });

  it('Aşama 10: Araç İlerleme Akışı (Progress Tracking)', () => {
    const events: number[] = [];
    const unsub = progressManager.subscribe((u) => events.push(u.percentage));
    const rep = progressManager.createReporter('c1', 'tool');
    rep.report(50, 'İşleniyor');
    rep.done();
    expect(events).toEqual([50, 100]);
    unsub();
  });

  it('Aşama 11: Kilitlenme Kurtarma (Reconciliation)', () => {
    reconciliationEngine.simulateCrashOrphan('orphan_1', 'dispatch');
    const res = reconciliationEngine.reconcile();
    expect(res.hasInconsistencies).toBe(true);
    expect(reconciliationEngine.reconcile().hasInconsistencies).toBe(false);
  });

  it('Aşama 12: CBOR (RFC 8949) İkili Sıkıştırma', () => {
    const data = { foo: 'bar', nums: [1, 2, 3] };
    const encoded = cborCodec.encode(data);
    expect(cborCodec.decode(encoded)).toEqual(data);
  });

  it('Aşama 13: Üstel Geri Çekilme (Exponential Backoff)', async () => {
    let attempts = 0;
    const res = await retryWithBackoff(async (i) => {
      attempts = i;
      if (i < 2) throw new Error('Hata');
      return 'OK';
    }, { maxAttempts: 3, baseDelayMs: 5 });
    expect(res).toBe('OK');
    expect(attempts).toBe(2);
  });
});
