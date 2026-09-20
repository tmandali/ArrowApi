import { describe, it, expect, beforeEach } from 'vitest';
import { z } from 'zod';
import { uiRegistry } from './component-registry';

describe('uiRegistry', () => {
  beforeEach(() => {
    uiRegistry.unregister('f');
  });

  it('register/get/hasCapability/unregister döngüsü', () => {
    uiRegistry.register({ id: 'f', capabilities: ['SET_FIELDS', 'SUBMIT'] });
    expect(uiRegistry.get('f')?.id).toBe('f');
    expect(uiRegistry.hasCapability('f', 'SUBMIT')).toBe(true);
    expect(uiRegistry.hasCapability('f', 'YOK')).toBe(false);
    uiRegistry.unregister('f');
    expect(uiRegistry.get('f')).toBeUndefined();
  });

  it('preflight: mount edilmemiş bileşen valid:false', () => {
    const r = uiRegistry.preflightValidate('yok', 'X');
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/mount/);
  });

  it('preflight: desteklenmeyen aksiyon valid:false', () => {
    uiRegistry.register({ id: 'f', capabilities: ['A'] });
    const r = uiRegistry.preflightValidate('f', 'B');
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/desteklemiyor/);
  });

  it('preflight: zod şema ihlali valid:false', () => {
    uiRegistry.register({
      id: 'f',
      capabilities: ['SET_FIELDS'],
      actions: {
        SET_FIELDS: {
          description: 'x',
          schema: z.object({ storeId: z.string().min(1) }),
          whenToCall: 'test',
          whenNotToCall: 'test',
        },
      },
    });
    const r = uiRegistry.preflightValidate('f', 'SET_FIELDS', { storeId: '' });
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/Zod/);
  });

  it('preflight: inputSchema ve when deterministik koşul denetimi', () => {
    uiRegistry.register({
      id: 'grid',
      capabilities: ['RUN_SQL'],
      actions: {
        RUN_SQL: {
          inputSchema: z.object({ query: z.string().startsWith('SELECT') }),
          outputSchema: z.object({ rowCount: z.number() }),
          when: { phase: 'results' },
          whenToCall: 'Sonuç analizinde çağrılır',
          whenNotToCall: 'Kriter fazında çağrılmaz',
        },
      },
    });

    // Phase mismatch -> preflight blocked
    const phaseFail = uiRegistry.preflightValidate('grid', 'RUN_SQL', { query: 'SELECT 1' }, { phase: 'workspace' });
    expect(phaseFail.valid).toBe(false);
    expect(phaseFail.error).toMatch(/requires screen phase "results"/);

    // Matching phase but bad inputSchema
    const inputFail = uiRegistry.preflightValidate('grid', 'RUN_SQL', { query: 'INSERT 1' }, { phase: 'results' });
    expect(inputFail.valid).toBe(false);
    expect(inputFail.error).toMatch(/Zod/);

    // Valid input & phase
    const ok = uiRegistry.preflightValidate('grid', 'RUN_SQL', { query: 'SELECT *' }, { phase: 'results' });
    expect(ok.valid).toBe(true);

    // Postflight validation
    const badOutput = uiRegistry.postflightValidate('grid', 'RUN_SQL', { rowCount: 'not a number' });
    expect(badOutput.valid).toBe(false);
    expect(badOutput.error).toMatch(/Output validation failed/);

    const goodOutput = uiRegistry.postflightValidate('grid', 'RUN_SQL', { rowCount: 100 });
    expect(goodOutput.valid).toBe(true);
    uiRegistry.unregister('grid');
  });

  it('formatActiveComponentsPrompt: outputSchema ve events prompta doğru yansır', () => {
    uiRegistry.register({
      id: 'form',
      meta: { description: 'Rapor kriter formu' },
      actions: {
        SUBMIT: {
          inputSchema: z.object({ report: z.string() }),
          outputSchema: z.object({ jobId: z.string(), queued: z.boolean() }),
          whenToCall: 'Raporu çalıştırmak için',
          whenNotToCall: 'Taslak aşamasında',
        },
      },
      events: {
        field_change: {
          description: 'Alan değeri değiştiğinde tetiklenir',
          schema: z.object({ field: z.string() }),
        },
      },
    });

    const prompt = uiRegistry.formatActiveComponentsPrompt();
    expect(prompt).toContain('Returns: { jobId, queued }');
    expect(prompt).toContain('Parameters: { report }');
    expect(prompt).toContain('Emitted Events: field_change');
    expect(prompt).toContain('Event [field_change]: Alan değeri değiştiğinde tetiklenir');
    uiRegistry.unregister('form');
  });
});
