import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SqliteSessionDriver } from './sqlite-session';
import type { SessionDump } from '../harness/session/session-harness';

describe('SqliteSessionDriver (Node 22 native node:sqlite)', () => {
  let driver: SqliteSessionDriver;

  beforeEach(() => {
    driver = new SqliteSessionDriver({ dbPath: ':memory:' });
  });

  afterEach(() => {
    driver.close();
  });

  const createMockDump = (sessionId: string, title?: string): SessionDump => ({
    version: '1.0',
    exportedAt: 1700000000000,
    sessionId,
    messages: [
      { role: 'user', content: 'Merhaba, bana satış raporunu göster' },
      { role: 'assistant', content: 'Tabii, satış raporunu hazırlıyorum.' },
    ],
    checkpoints: [
      {
        id: `cp_1_${sessionId}`,
        label: 'Kriterler Belirlendi',
        timestamp: 1700000001000,
        snapshot: {
          route: '/reports/sales',
          state: { branchId: 101, year: 2026 },
          events: [],
        },
      },
    ],
    branches: [
      {
        id: `branch_main_${sessionId}`,
        name: 'main',
        createdAt: 1700000000000,
        currentIndex: 0,
        checkpoints: [
          {
            id: `cp_1_${sessionId}`,
            label: 'Kriterler Belirlendi',
            timestamp: 1700000001000,
            snapshot: {
              route: '/reports/sales',
              state: { branchId: 101, year: 2026 },
              events: [],
            },
          },
        ],
      },
    ],
    events: [],
    telemetrySummary: {
      totalTurns: 1,
      totalDurationMs: 120,
      totalTokens: 330,
      totalEstimatedCostUsd: 0.001,
      averageTurnDurationMs: 120,
    },
    memory: [{ key: 'last_branch', value: 101, scope: 'session', updatedAt: 1700000000000 }],
    uiState: { currentTab: 'grid' },
  });

  it('saves and loads a complete session dump', () => {
    const dump = createMockDump('sess_001');
    driver.saveSession(dump, '2026 Satış Analizi', { tags: ['sales', 'erp'] });

    const loaded = driver.loadSession('sess_001');
    expect(loaded).toBeDefined();
    expect(loaded?.sessionId).toBe('sess_001');
    expect(loaded?.messages).toHaveLength(2);
    expect(loaded?.checkpoints).toHaveLength(1);
    expect(loaded?.memory[0].key).toBe('last_branch');
  });

  it('lists saved sessions with accurate metadata and checkpoint counts', () => {
    driver.saveSession(createMockDump('sess_a'), 'Oturum A');
    driver.saveSession(createMockDump('sess_b'), 'Oturum B');

    const list = driver.listSessions();
    expect(list).toHaveLength(2);

    const sessA = list.find((s) => s.id === 'sess_a');
    expect(sessA?.title).toBe('Oturum A');
    expect(sessA?.checkpointCount).toBe(1);
    expect(sessA?.byteSize).toBeGreaterThan(0);
  });

  it('extracts checkpoints and allows filtering by branch', () => {
    const dump = createMockDump('sess_multi');
    dump.branches.push({
      id: 'branch_exp',
      name: 'experiment',
      createdAt: 1700000002000,
      currentIndex: 0,
      checkpoints: [
        {
          id: 'cp_exp_1',
          label: 'Filtre Değiştirildi',
          timestamp: 1700000003000,
          snapshot: {
            route: '/reports/sales',
            state: { branchId: 999 },
            events: [],
          },
        },
      ],
    });

    driver.saveSession(dump);

    const allCheckpoints = driver.getCheckpoints('sess_multi');
    expect(allCheckpoints).toHaveLength(2);

    const expCheckpoints = driver.getCheckpoints('sess_multi', 'experiment');
    expect(expCheckpoints).toHaveLength(1);
    expect(expCheckpoints[0].label).toBe('Filtre Değiştirildi');
  });

  it('searches sessions by title or content substring', () => {
    driver.saveSession(createMockDump('sess_sales'), 'Haftalık Satış İcmali');

    const invDump = createMockDump('sess_inventory', 'Stok Sayım Listesi');
    invDump.messages = [
      { role: 'user', content: 'Depo stok durumunu listele' },
      { role: 'assistant', content: 'Depo stok durumu getirildi.' },
    ];
    driver.saveSession(invDump, 'Stok Sayım Listesi');

    const searchSales = driver.searchSessions('Satış');
    expect(searchSales.map((s) => s.id)).toContain('sess_sales');
    expect(searchSales.map((s) => s.id)).not.toContain('sess_inventory');

    const searchContent = driver.searchSessions('stok');
    expect(searchContent.map((s) => s.id)).toContain('sess_inventory');
  });

  it('deletes session and cascades associated checkpoints', () => {
    driver.saveSession(createMockDump('sess_to_del'), 'Silinecek');
    expect(driver.loadSession('sess_to_del')).not.toBeNull();

    const deleted = driver.deleteSession('sess_to_del');
    expect(deleted).toBe(true);
    expect(driver.loadSession('sess_to_del')).toBeNull();
    expect(driver.getCheckpoints('sess_to_del')).toHaveLength(0);
  });
});
