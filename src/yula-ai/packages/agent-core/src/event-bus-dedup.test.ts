import { describe, it, expect, beforeEach, vi } from 'vitest';
import { uiEventBus } from './event-bus';

describe('uiEventBus Telemetri Tekilleştirme ve Coalescing (Dedup)', () => {
  beforeEach(() => {
    uiEventBus.clear();
    uiEventBus.setDedupWindow(250);
    vi.useRealTimers();
  });

  it('birebir aynı ardışık olayları zaman penceresi içinde tekilleştirir (Identical Dedup)', () => {
    uiEventBus.recordTelemetry({ source: 'search_bar', type: 'CLICK', payload: { button: 'submit' } });
    uiEventBus.recordTelemetry({ source: 'search_bar', type: 'CLICK', payload: { button: 'submit' } });
    uiEventBus.recordTelemetry({ source: 'search_bar', type: 'CLICK', payload: { button: 'submit' } });

    const events = uiEventBus.getRecentEvents();
    expect(events).toHaveLength(1);
    expect(events[0].source).toBe('search_bar');
    expect(events[0].type).toBe('CLICK');
  });

  it('ardışık durum değişikliklerini yerinde birleştirir (In-place Coalescing) ve ring bufferı tüketmez', () => {
    // 1. Önceki bir navigasyon olayı
    uiEventBus.recordTelemetry({ source: 'app_router', type: 'NAVIGATE', payload: { path: '/stock' } });

    // 2. Kullanıcı arama kutusuna hızlıca 5 karakter yazıyor
    uiEventBus.recordTelemetry({ source: 'search_filter', type: 'CHANGE', payload: { query: 'k' } });
    uiEventBus.recordTelemetry({ source: 'search_filter', type: 'CHANGE', payload: { query: 'ka' } });
    uiEventBus.recordTelemetry({ source: 'search_filter', type: 'CHANGE', payload: { query: 'kal' } });
    uiEventBus.recordTelemetry({ source: 'search_filter', type: 'CHANGE', payload: { query: 'kale' } });
    uiEventBus.recordTelemetry({ source: 'search_filter', type: 'CHANGE', payload: { query: 'kalem' } });

    const events = uiEventBus.getRecentEvents();
    // Normalde 6 olay olurdu ve eski olaylar tükenme riski taşırdı; birleştirme sayesinde 2 olay kalır!
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ source: 'app_router', type: 'NAVIGATE', payload: { path: '/stock' } });
    expect(events[1]).toMatchObject({ source: 'search_filter', type: 'CHANGE', payload: { query: 'kalem' } });
  });

  it('farklı kaynak veya tipteki olayları zaman penceresinde olsa dahi ayrı ayrı kaydeder', () => {
    uiEventBus.recordTelemetry({ source: 'comp_a', type: 'CLICK' });
    uiEventBus.recordTelemetry({ source: 'comp_b', type: 'CLICK' });
    uiEventBus.recordTelemetry({ source: 'comp_a', type: 'HOVER' });

    const events = uiEventBus.getRecentEvents();
    expect(events).toHaveLength(3);
  });

  it('force: true seçeneği tekilleştirmeyi atlar', () => {
    uiEventBus.recordTelemetry({ source: 'btn', type: 'CLICK' });
    uiEventBus.recordTelemetry({ source: 'btn', type: 'CLICK' }, { force: true });

    const events = uiEventBus.getRecentEvents();
    expect(events).toHaveLength(2);
  });

  it('coalesce: false seçeneği yerinde birleştirme yapmaz, yeni kayıt açar', () => {
    uiEventBus.recordTelemetry({ source: 'input', type: 'CHANGE', payload: { val: '1' } });
    uiEventBus.recordTelemetry({ source: 'input', type: 'CHANGE', payload: { val: '2' } }, { coalesce: false });

    const events = uiEventBus.getRecentEvents();
    expect(events).toHaveLength(2);
    expect(events[0].payload.val).toBe('1');
    expect(events[1].payload.val).toBe('2');
  });

  it('zaman penceresi aşıldığında aynı olay yeni bir kayıt olarak eklenir', async () => {
    vi.useFakeTimers();
    uiEventBus.setDedupWindow(100);

    uiEventBus.recordTelemetry({ source: 'btn', type: 'CLICK' });
    expect(uiEventBus.getRecentEvents()).toHaveLength(1);

    // 150ms sonra (pencere 100ms)
    vi.advanceTimersByTime(150);

    uiEventBus.recordTelemetry({ source: 'btn', type: 'CLICK' });
    expect(uiEventBus.getRecentEvents()).toHaveLength(2);
  });

  it('setDedupWindow(0) tekilleştirmeyi tamamen kapatır', () => {
    uiEventBus.setDedupWindow(0);
    uiEventBus.recordTelemetry({ source: 'btn', type: 'CLICK' });
    uiEventBus.recordTelemetry({ source: 'btn', type: 'CLICK' });

    expect(uiEventBus.getRecentEvents()).toHaveLength(2);
  });

  it('birleştirilen olaylar dinleyicilere (telemetryListeners) trailing debounce ile iletilir', async () => {
    vi.useFakeTimers();
    const listener = vi.fn();
    uiEventBus.onTelemetry(listener);

    // İlk olay hemen iletilir
    uiEventBus.recordTelemetry({ source: 'input', type: 'TYPING', payload: 'a' });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({ payload: 'a' }));

    // Hızlı ardışık yazmalar debounce edilir
    uiEventBus.recordTelemetry({ source: 'input', type: 'TYPING', payload: 'ab' });
    uiEventBus.recordTelemetry({ source: 'input', type: 'TYPING', payload: 'abc' });
    expect(listener).toHaveBeenCalledTimes(1);

    // Timer tetiklendiğinde son değer iletilir
    vi.advanceTimersByTime(60);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({ payload: 'abc' }));
  });
});
