import { describe, it, expect } from 'vitest';
import { createGate, AbortRequested } from './effect-gate';

describe('Effect Gate Synchronous & Async Admission Engine', () => {
  it('admits synchronous operations when open', () => {
    const { gate } = createGate();
    expect(gate.isOpen()).toBe(true);
    expect(gate.isAborted()).toBe(false);

    const result = gate.admit(() => 42);
    expect(result).toBe(42);
  });

  it('admits asynchronous operations when open', async () => {
    const { gate } = createGate();

    const result = await gate.admitAsync(async () => {
      return 'duckdb_query_completed';
    });
    expect(result).toBe('duckdb_query_completed');
  });

  it('blocks admission when abort requested and throws AbortRequested', () => {
    const { gate, control } = createGate();

    control.beginAbort(Promise.resolve());
    expect(gate.isAborted()).toBe(true);

    expect(() => {
      gate.admit(() => 'should_not_run');
    }).toThrow(AbortRequested);
  });

  it('triggers AbortSignal on signalAbort', () => {
    const { gate, control } = createGate();
    expect(gate.signal.aborted).toBe(false);

    control.beginAbort(Promise.resolve());
    control.signalAbort();

    expect(gate.signal.aborted).toBe(true);
  });

  it('closes gate and rejects subsequent calls with custom terminal error', () => {
    const { gate, control } = createGate();

    const customErr = new Error('Terminal process crash');
    control.close(customErr);

    expect(control.isClosed()).toBe(true);
    expect(() => {
      gate.admit(() => 'blocked');
    }).toThrow('Terminal process crash');
  });
});
