import { describe, it, expect, beforeEach } from 'vitest';
import { PlaybookService, MemoryPlaybookStorage } from './playbook';

describe('PlaybookService & LLM Wiki Çekirdek Motoru', () => {
  let service: PlaybookService;
  let storage: MemoryPlaybookStorage;

  beforeEach(() => {
    storage = new MemoryPlaybookStorage();
    service = new PlaybookService(storage);
  });

  it('ekran kuralını (screen_rule) başarıyla kaydeder, log ve index senkronize olur', async () => {
    const entry = await service.recordEntry({
      scope: 'workspace',
      workspaceId: 'stock',
      category: 'screen_rule',
      title: 'Konsinye Depolar Hariç Tutulmalı',
      targetPath: '/stock/stock-balance',
      contentMarkdown: '- Bakiye analizinde konsinye depolar asla dahil edilmemelidir.\n- Varsayılan depo: MERKEZ',
      author: 'Ahmet (Stok Yöneticisi)',
    });

    expect(entry.id).toBeDefined();
    expect(entry.createdAt).toBeDefined();

    // 1. Ekran kuralı getirme (0 ms keşif)
    const rules = await service.getScreenRules('/stock/stock-balance', 'stock');
    expect(rules).toHaveLength(2);
    expect(rules[0]).toContain('konsinye depolar asla dahil edilmemelidir');
    expect(rules[1]).toContain('Varsayılan depo: MERKEZ');

    // Farklı bir ekranda kural gelmemeli
    const salesRules = await service.getScreenRules('/selling/orders', 'stock');
    expect(salesRules).toHaveLength(0);

    // 2. Index doğrulaması
    const index = await service.getIndex('stock');
    expect(index).toHaveLength(1);
    expect(index[0].title).toBe('Konsinye Depolar Hariç Tutulmalı');
    expect(index[0].targetPath).toBe('/stock/stock-balance');

    // 3. Log doğrulaması (append-only)
    const log = await service.getLog('stock');
    expect(log).toHaveLength(1);
    expect(log[0].action).toBe('rule_learned');
    expect(log[0].author).toBe('Ahmet (Stok Yöneticisi)');
  });

  it('iş akışı reçetesini (workflow_recipe) arar ve bulur', async () => {
    await service.recordEntry({
      scope: 'workspace',
      workspaceId: 'stock',
      category: 'workflow_recipe',
      title: 'Ay Sonu Stok ve Fire Mutabakatı',
      tags: ['fire', 'mutabakat', 'ay sonu', 'stok bakiye'],
      contentMarkdown: '1. /stock/stock-balance ekranına git.\n2. Konsinye=0 yap.\n3. Çalıştır.\n4. DuckDB SQL ile fire oranını grupla.',
    });

    // Anahtar kelime araması
    const match = await service.findRecipe('stok fire mutabakatı', 'stock');
    expect(match).not.toBeNull();
    expect(match?.title).toBe('Ay Sonu Stok ve Fire Mutabakatı');
    expect(match?.contentMarkdown).toContain('DuckDB SQL ile fire oranını grupla');

    // Alakasız aramada null dönmeli
    const noMatch = await service.findRecipe('personel bordro hesaplama', 'stock');
    expect(noMatch).toBeNull();
  });

  it('kural silindiğinde index ve log güncellenir', async () => {
    const entry = await service.recordEntry({
      scope: 'workspace',
      workspaceId: 'stock',
      category: 'screen_rule',
      title: 'Geçici Test Kuralı',
      targetPath: '/stock/test',
      contentMarkdown: 'Test kuralı',
    });

    const indexBefore = await service.getIndex('stock');
    expect(indexBefore).toHaveLength(1);

    const removed = await service.removeEntry(entry.id, 'stock');
    expect(removed).toBe(true);

    const indexAfter = await service.getIndex('stock');
    expect(indexAfter).toHaveLength(0);

    const log = await service.getLog('stock');
    expect(log).toHaveLength(2); // 1 create + 1 delete
    expect(log[1].action).toBe('entry_deleted');
  });

  it('lint işlemi boş veya hatalı kuralları uyarır', async () => {
    await service.recordEntry({
      scope: 'workspace',
      workspaceId: 'stock',
      category: 'screen_rule',
      title: 'Boş Kural',
      targetPath: '/stock/empty',
      contentMarkdown: '   ',
    });

    const report = await service.lint('stock');
    expect(report.warnings).toHaveLength(1);
    expect(report.warnings[0]).toContain('boş içeriğe sahip');
  });

  it('farklı bir adaptör (LocalStoragePlaybookStorage) ile ezilebilir (override)', async () => {
    // Tarayıcı mock localStorage
    const store = new Map<string, string>();
    (globalThis as any).window = {};
    (globalThis as any).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
      removeItem: (k: string) => store.delete(k),
      clear: () => store.clear(),
    };

    const { LocalStoragePlaybookStorage } = await import('./playbook');
    const localAdapter = new LocalStoragePlaybookStorage('test_playbook_');
    const customService = new PlaybookService(localAdapter);

    await customService.recordEntry({
      scope: 'workspace',
      workspaceId: 'crm',
      category: 'screen_rule',
      title: 'Müşteri Kredi Limiti Kuralı',
      targetPath: '/crm/customers',
      contentMarkdown: '- Kredi limiti 50.000 TL üzeri olan müşterilerde Finans onayı zorunludur.',
    });

    const rules = await customService.getScreenRules('/crm/customers', 'crm');
    expect(rules).toHaveLength(1);
    expect(rules[0]).toContain('Finans onayı zorunludur');

    // LocalStorage'a gerçekten yazıldığını doğrula
    expect(store.get('test_playbook_crm_entries')).toBeDefined();
    expect(store.get('test_playbook_crm_entries')).toContain('Müşteri Kredi Limiti Kuralı');

    delete (globalThis as any).window;
    delete (globalThis as any).localStorage;
  });
});

