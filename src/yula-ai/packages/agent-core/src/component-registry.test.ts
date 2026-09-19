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
});
