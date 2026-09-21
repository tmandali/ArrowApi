import { describe, it, expect, beforeEach } from 'vitest';
import { uiEventBus } from './event-bus';
import { TELEMETRY_TOPICS } from './types';
import { agentUiTools } from './standard-tools';

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

  it('rapor yaşam döngüsü ve kriter telemetri olaylarını kaydeder', () => {
    uiEventBus.recordTelemetry({
      source: 'arrow_job',
      type: 'JOB_SELECTED',
      payload: { jobId: 'job-456', title: 'Stok Raporu', totalRows: 120 },
    });

    uiEventBus.recordTelemetry({
      source: 'result_grid',
      type: 'EXPORT_TRIGGERED',
      payload: { format: 'xlsx', rowCount: 120, title: 'Stok Raporu' },
    });

    uiEventBus.recordTelemetry({
      source: 'criteria_form',
      type: 'CRITERIA_SUBMITTED',
      payload: { report: 'stock-balances', criteria: { warehouse: 'WH-1' } },
    });

    uiEventBus.recordTelemetry({
      source: 'criteria_form',
      type: 'CRITERIA_RESET',
      payload: { report: 'stock-balances' },
    });

    const recent = uiEventBus.getRecentEvents();
    expect(recent).toHaveLength(4);
    expect(recent[0].type).toBe('JOB_SELECTED');
    expect(recent[1].type).toBe('EXPORT_TRIGGERED');
    expect(recent[2].type).toBe('CRITERIA_SUBMITTED');
    expect(recent[3].type).toBe('CRITERIA_RESET');
    // Doğal topic türetimini doğrula
    expect(recent[0].topic).toBe('jobs');
    expect(recent[1].topic).toBe('data');
    expect(recent[2].topic).toBe('form');
    expect(recent[3].topic).toBe('form');
  });

  it('getRecentEvents topic, source ve type filtrelerini doğru uygular', () => {
    uiEventBus.recordTelemetry({ source: 'arrow_job', type: 'REPORT_COMPLETED', payload: { jobId: 'j1' } });
    uiEventBus.recordTelemetry({ source: 'result_grid', type: 'ROW_SELECTED', payload: { id: 1 } });
    uiEventBus.recordTelemetry({ source: 'result_grid', type: 'FILTER_APPLIED', payload: { field: 'f1', value: 'v1' } });
    uiEventBus.recordTelemetry({ source: 'app_router', type: 'ROUTE_CHANGED', payload: { path: '/stock' } });

    // Topic filtresi
    const jobEvents = uiEventBus.getRecentEvents({ topic: 'jobs' });
    expect(jobEvents).toHaveLength(1);
    expect(jobEvents[0].type).toBe('REPORT_COMPLETED');

    const dataEvents = uiEventBus.getRecentEvents({ topic: 'data' });
    expect(dataEvents).toHaveLength(2);

    // Type filtresi
    const selectedRows = uiEventBus.getRecentEvents({ type: 'ROW_SELECTED' });
    expect(selectedRows).toHaveLength(1);
    expect(selectedRows[0].payload).toEqual({ id: 1 });

    // Limit filtresi
    const limited = uiEventBus.getRecentEvents({ limit: 2 });
    expect(limited).toHaveLength(2);
  });

  it('coalesceKey ile tekrarlayan olayları aynı slotta günceller', () => {
    uiEventBus.recordTelemetry(
      { source: 'result_grid', type: 'ROW_SELECTED', payload: { id: 1, name: 'İlk' } },
      { coalesceKey: 'grid:row_selected' }
    );
    uiEventBus.recordTelemetry(
      { source: 'result_grid', type: 'ROW_SELECTED', payload: { id: 2, name: 'İkinci' } },
      { coalesceKey: 'grid:row_selected' }
    );

    const events = uiEventBus.getRecentEvents();
    expect(events).toHaveLength(1);
    expect(events[0].payload).toEqual({ id: 2, name: 'İkinci' });
  });

  it('yoğun grid olaylarında topic filtresiyle job olayları kaybolmaz (starvation immunity)', () => {
    uiEventBus.recordTelemetry({ source: 'arrow_job', type: 'REPORT_COMPLETED', payload: { jobId: 'critical-job' } });

    // 15 adet grid olayı gönder
    for (let i = 0; i < 15; i++) {
      uiEventBus.recordTelemetry({
        source: 'result_grid',
        type: 'FILTER_APPLIED',
        payload: { field: `col_${i}`, value: i },
      });
    }

    // Doğrudan jobs konusunu sorguladığımızda rapor olayı sapasağlam bulunmalı
    const jobs = uiEventBus.getRecentEvents({ topic: 'jobs' });
    expect(jobs).toHaveLength(1);
    expect(jobs[0].payload).toEqual({ jobId: 'critical-job' });
  });

  it('distinctByType aynı topic içindeki tekrarlayan olay tiplerinden yalnızca en sonuncusunu korur', () => {
    // 3 adet filtre olayı ve 1 satır seçimi gönder
    uiEventBus.recordTelemetry({ source: 'result_grid', type: 'FILTER_APPLIED', payload: { field: 'Depo', value: 1 } }, { force: true });
    uiEventBus.recordTelemetry({ source: 'result_grid', type: 'FILTER_APPLIED', payload: { field: 'Depo', value: 2 } }, { force: true });
    uiEventBus.recordTelemetry({ source: 'result_grid', type: 'ROW_SELECTED', payload: { id: 10, code: 'STK-01' } }, { force: true });
    uiEventBus.recordTelemetry({ source: 'result_grid', type: 'FILTER_APPLIED', payload: { field: 'Depo', value: 3 } }, { force: true });

    const distinct = uiEventBus.getRecentEvents({ distinctByType: true });
    // FILTER_APPLIED'dan sadece sonuncusu (Depo: 3) ve ROW_SELECTED kalmalı
    expect(distinct).toHaveLength(2);
    expect(distinct[0].type).toBe('ROW_SELECTED');
    expect(distinct[1].type).toBe('FILTER_APPLIED');
    expect(distinct[1].payload).toEqual({ field: 'Depo', value: 3 });
  });

  it('getTopicBalancedEvents her aktif topic için dengeli ve tekil son durumu döner', () => {
    uiEventBus.recordTelemetry({ source: 'arrow_job', type: 'REPORT_COMPLETED', payload: { jobId: 'job-1' } });
    uiEventBus.recordTelemetry({ source: 'result_grid', type: 'FILTER_APPLIED', payload: { field: 'wh', value: 'old' } }, { force: true });
    uiEventBus.recordTelemetry({ source: 'result_grid', type: 'FILTER_APPLIED', payload: { field: 'wh', value: 'latest' } }, { force: true });
    uiEventBus.recordTelemetry({ source: 'result_grid', type: 'ROW_SELECTED', payload: { id: 5 } }, { force: true });
    uiEventBus.recordTelemetry({ source: 'criteria_form', type: 'CRITERIA_SUBMITTED', payload: { report: 'rep-1' } });
    uiEventBus.recordTelemetry({ source: 'app_router', type: 'ROUTE_CHANGED', payload: { path: '/stock' } });

    const balanced = uiEventBus.getTopicBalancedEvents(2, true);
    // data topic'inde eski filtre silinmiş, yeni filtre ve satır seçimi kalmış olmalı
    const dataEvents = balanced.filter((e) => e.topic === 'data');
    expect(dataEvents).toHaveLength(2);
    expect(dataEvents.map((e) => e.type)).toEqual(['FILTER_APPLIED', 'ROW_SELECTED']);
    expect(dataEvents.find((e) => e.type === 'FILTER_APPLIED')?.payload).toEqual({ field: 'wh', value: 'latest' });

    // jobs, form, navigation'dan da 1'er olay korunmalı
    expect(balanced.some((e) => e.topic === 'jobs')).toBe(true);
    expect(balanced.some((e) => e.topic === 'form')).toBe(true);
    expect(balanced.some((e) => e.topic === 'navigation')).toBe(true);
  });

  it('TELEMETRY_TOPICS kataloğu 5 ana kategoriyi ve şema tanımlarını içerir', () => {
    expect(TELEMETRY_TOPICS.jobs.key).toBe('jobs');
    expect(TELEMETRY_TOPICS.data.key).toBe('data');
    expect(TELEMETRY_TOPICS.form.key).toBe('form');
    expect(TELEMETRY_TOPICS.navigation.key).toBe('navigation');
    expect(TELEMETRY_TOPICS.system.key).toBe('system');
    expect(TELEMETRY_TOPICS.data.typicalEvents).toContain('ROW_SELECTED');
  });

  it('inspect_ui_state available_topics ve topic bazlı filtrelemeyi destekler', async () => {
    uiEventBus.recordTelemetry({ source: 'result_grid', type: 'ROW_SELECTED', payload: { id: 10 } });
    uiEventBus.recordTelemetry({ source: 'criteria_form', type: 'FIELD_CHANGED', payload: { field: 'store', value: '101' } });

    const res = (await agentUiTools.inspect_ui_state.execute({ topic: 'data' } as any)) as any;
    expect(res.success).toBe(true);
    expect(res.available_topics).toBeDefined();
    expect(res.available_topics.data.key).toBe('data');
    expect(res.recent_events.every((e: any) => e.topic === 'data')).toBe(true);
  });
});



