import { describe, it, expect, beforeEach } from 'vitest';
import { uiEventBus } from './event-bus';

describe('uiEventBus', () => {
  beforeEach(() => {
    uiEventBus.clearTelemetry();
  });

  it('dispatch bilinmeyen bileşende success:false döner', () => {
    const res = uiEventBus.dispatch({ component_id: 'yok', action: 'X' });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/bulunamadı/);
  });

  it('handler sonucunu iletir (success:false dahil)', () => {
    uiEventBus.subscribe('c1', () => ({ success: false, error: 'bozuk' }));
    const res = uiEventBus.dispatch({ component_id: 'c1', action: 'GO' });
    expect(res.success).toBe(false);
    expect(res.error).toBe('bozuk');
  });

  it('ring-buffer son 10 olayı tutar', () => {
    for (let i = 0; i < 12; i++) {
      uiEventBus.recordTelemetry({ source: 's', type: `E${i}` });
    }
    const events = uiEventBus.getRecentEvents();
    expect(events).toHaveLength(10);
    expect(events[0].type).toBe('E2');
    expect(events[9].type).toBe('E11');
  });

  it('onTelemetry listener çağrılır ve unsubscribe çalışır', () => {
    let count = 0;
    const off = uiEventBus.onTelemetry(() => count++);
    uiEventBus.recordTelemetry({ source: 's', type: 'A' });
    off();
    uiEventBus.recordTelemetry({ source: 's', type: 'B' });
    expect(count).toBe(1);
  });

  it('standart AppTelemetryEvent nesnelerini doğru formatta kaydeder', () => {
    uiEventBus.recordTelemetry({
      source: 'arrow_job',
      type: 'REPORT_COMPLETED',
      payload: { jobId: 'job-123', totalRows: 42, durationMs: 1500 },
    });

    uiEventBus.recordTelemetry({
      source: 'result_grid',
      type: 'ROW_SELECTED',
      payload: { id: 99, rowData: { code: 'PRD-1' } },
    });

    const recent = uiEventBus.getRecentEvents();
    expect(recent).toHaveLength(2);
    expect(recent[0].source).toBe('arrow_job');
    expect(recent[0].type).toBe('REPORT_COMPLETED');
    expect(recent[0].payload).toEqual({ jobId: 'job-123', totalRows: 42, durationMs: 1500 });
    expect(recent[1].source).toBe('result_grid');
    expect(recent[1].type).toBe('ROW_SELECTED');
  });
});
