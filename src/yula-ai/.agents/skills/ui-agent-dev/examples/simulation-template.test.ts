import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  uiRegistry,
  uiEventBus,
  executeComponentAction,
  hookPipeline,
  sessionManager,
  steeringManager,
  telemetryTracker,
  truncateOutput,
  mutationLine,
  agentMemory,
  agentUiTools,
  skillsManager,
  multiLaneScheduler,
  progressManager,
  reconciliationEngine,
  cborCodec,
  retryWithBackoff,
} from '@my-agent/core';

describe('🤖 Headless UI-Agent Deterministik Entegrasyon Simülasyonu', () => {
  // 1. Ortamı Sıfırla
  uiRegistry.clear();
  uiEventBus.clear();
  agentMemory.clear();
  sessionManager.reset();
  telemetryTracker.reset();

  // 2. Örnek Bileşen Kaydı
  uiRegistry.register({
    id: 'example_form',
    capabilities: ['SUBMIT_FORM'],
    actionSchemas: {
      SUBMIT_FORM: z.object({
        email: z.string().email('Geçerli bir e-posta giriniz'),
      }),
    },
    meta: {
      whenToCall: 'Kullanıcı formu göndermek istediğinde çağrılır.',
      whenNotToCall: 'E-posta formatı geçersizken çağrılmamalıdır.',
    },
  });

  uiEventBus.subscribe('example_form', (action, payload) => {
    return { success: true, action, payload };
  });

  it('Aşama 1: Zod Preflight ve Kendi Kendini Onarma (Self-Healing)', async () => {
    const invalid = await executeComponentAction({
      component_id: 'example_form',
      action: 'SUBMIT_FORM',
      payload: { email: 'gecersiz-eposta' },
    });
    expect(invalid.success).toBe(false);
    expect(invalid.error).toContain('Zod Validasyon Hatası');

    const valid = await executeComponentAction({
      component_id: 'example_form',
      action: 'SUBMIT_FORM',
      payload: { email: 'user@example.com' },
    });
    expect(valid.success).toBe(true);
  });

  it('Aşama 2: Human-in-the-Loop (HITL) beforeToolCall Onay Döngüsü', async () => {
    let prompted = false;
    const unsub = hookPipeline.beforeToolCall(async (ctx) => {
      if (ctx.args?.action === 'SUBMIT_FORM') {
        prompted = true;
        return {}; // Onaylandı
      }
      return {};
    });

    const res = await executeComponentAction({
      component_id: 'example_form',
      action: 'SUBMIT_FORM',
      payload: { email: 'approved@example.com' },
    });

    expect(prompted).toBe(true);
    expect(res.success).toBe(true);
    unsub();
  });

  it('Aşama 3: Steering ve Follow-up Kuyruğu', () => {
    steeringManager.clear();
    steeringManager.steer('İptal et ve geri dön');
    expect(steeringManager.hasSteering()).toBe(true);
    expect(steeringManager.popSteer()?.content).toContain('İptal');

    steeringManager.followUp('Logları temizle');
    expect(steeringManager.hasFollowUp()).toBe(true);
    expect(steeringManager.popFollowUp()?.content).toContain('temizle');
  });

  it('Aşama 4: Dual-Bound Truncation (Token Guard)', () => {
    const bigString = Array.from({ length: 300 }, (_, i) => `Line ${i}`).join('\n');
    const result = truncateOutput(bigString, { maxLines: 15, maxBytes: 400 });
    expect(result.truncated).toBe(true);
    expect(result.content).toContain('Pi Token Guard');
  });

  it('Aşama 5: MutationLine ile Atomik Sıralı Mutasyon', async () => {
    const sequence: number[] = [];
    await Promise.all([
      mutationLine.enqueue(async () => { sequence.push(1); }),
      mutationLine.enqueue(async () => { sequence.push(2); }),
    ]);
    expect(sequence).toEqual([1, 2]);
  });

  it('Aşama 6: Zaman Yolculuğu (Undo / Redo Checkpointing)', () => {
    sessionManager.checkpoint('Durum A', { step: 'A' });
    sessionManager.checkpoint('Durum B', { step: 'B' });

    expect(sessionManager.canUndo()).toBe(true);
    const undoRes = sessionManager.undo();
    expect(undoRes?.label).toBe('Durum A');

    const redoRes = sessionManager.redo();
    expect(redoRes?.label).toBe('Durum B');
  });

  it('Aşama 7: Telemetri & Token Maliyet Hesaplama', () => {
    telemetryTracker.reset();
    telemetryTracker.setModelPricing(0.15, 0.60);
    telemetryTracker.startTurn();
    telemetryTracker.recordToolExecution('dispatch_component_action', true, 100);

    const metric = telemetryTracker.endTurn(5_000, 1_000);
    expect(metric.totalTokens).toBe(6_000);
    expect(metric.toolsSuccessRate).toBe(100);
  });

  it('Aşama 8: Ajan Hafıza CRUD Yönetimi (Memory)', async () => {
    agentMemory.clear();
    agentMemory.remember('user_role', 'admin', 'session');
    expect(agentMemory.recall('user_role')).toBe('admin');
    agentMemory.forget('user_role');
    expect(agentMemory.recall('user_role')).toBeUndefined();
  });
});
