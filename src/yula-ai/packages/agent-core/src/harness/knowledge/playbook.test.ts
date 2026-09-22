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

  describe('Yönetişim & Taslak Öneri Yaşam Döngüsü (Option B Governance)', () => {
    it('kullanıcı önerisi taslak (draft) olarak kaydedilir ve onaylanana kadar aramalarda çıkmaz (İzolasyon)', async () => {
      const storage = new MemoryPlaybookStorage();
      const service = new PlaybookService(storage);

      // Kullanıcı kural ve reçete önerir
      await service.proposeEntry({
        scope: 'workspace',
        workspaceId: 'stock',
        category: 'workflow_recipe',
        title: 'Özel Depo Transfer Onayı',
        contentMarkdown: '1. Transfer talebi aç\n2. Müdür onayı al\n3. Sevk et',
        proposedBy: 'Ahmet',
      });

      await service.proposeEntry({
        scope: 'workspace',
        workspaceId: 'stock',
        category: 'screen_rule',
        title: 'Taslak İskonto Kısıtı',
        targetPath: '/stock/stock-balance',
        contentMarkdown: '- Onaysız taslak kural',
        proposedBy: 'Mehmet',
      });

      // İzolasyon testi: Aktif aramalarda çıkmamalı
      const recipe = await service.findRecipe('Depo Transfer', 'stock');
      expect(recipe).toBeNull();

      const screenRules = await service.getScreenRules('/stock/stock-balance', 'stock');
      expect(screenRules).toHaveLength(0);

      // Taslak listesinde görünmeli
      const proposals = await service.getProposals('stock');
      expect(proposals).toHaveLength(2);
      expect(proposals[0].status).toBe('draft');
      expect(proposals[0].proposedBy).toBe('Ahmet');

      // Admin onayı testi
      const approvedRecipe = await service.approveProposal(proposals[0].id, 'stock', 'Admin Ali');
      expect(approvedRecipe).not.toBeNull();
      expect(approvedRecipe?.status).toBe('approved');
      expect(approvedRecipe?.reviewedBy).toBe('Admin Ali');

      // Artık aramalarda çıkmalı
      const foundRecipe = await service.findRecipe('Depo Transfer', 'stock');
      expect(foundRecipe).not.toBeNull();
      expect(foundRecipe?.title).toBe('Özel Depo Transfer Onayı');

      // Kalan taslak sayısı 1 olmalı
      const remainingProposals = await service.getProposals('stock');
      expect(remainingProposals).toHaveLength(1);

      // Reddetme testi
      const rejected = await service.rejectProposal(proposals[1].id, 'stock', 'Gereksiz kural');
      expect(rejected).toBe(true);

      const emptyProposals = await service.getProposals('stock');
      expect(emptyProposals).toHaveLength(0);
    });
  });

  describe('Two-Tier Intent Resolution & Subagent Resolver', () => {    it('alt ajan çözümleyicisi kayıtlıysa öncelikle onu çalıştırmalı ve sonucu dönmelidir', async () => {
      await service.recordEntry({
        scope: 'workspace',
        workspaceId: 'stock',
        category: 'workflow_recipe',
        title: 'Depo Sayım ve Envanter Eşitleme',
        contentMarkdown: '1. Sayımı başlat\n2. Farkları raporla',
      });

      // Alt ajan simülasyonu
      service.setSubagentResolver(async (query, ws) => {
        if (query.includes('stok mutabakatı')) {
          const all = await storage.readEntries(ws);
          const found = all.find((e) => e.title.includes('Depo Sayım'));
          return {
            status: 'ok',
            matched: true,
            confidence: 0.95,
            recipe: found || null,
            screenRules: [],
            explanation: 'Subagent matched intent to Depo Sayım',
          };
        }
        return null;
      });

      const res = await service.resolveIntent('ay sonu stok mutabakatı yapalım', 'stock');
      expect(res.matched).toBe(true);
      expect(res.status).toBe('ok');
      expect(res.confidence).toBe(0.95);
      expect(res.recipe?.title).toBe('Depo Sayım ve Envanter Eşitleme');
      expect(res.explanation).toContain('Subagent matched');
    });

    it('alt ajan tanımlı değilse veya null dönerse deterministik yerel aramaya düşmelidir', async () => {
      await service.recordEntry({
        scope: 'workspace',
        workspaceId: 'stock',
        category: 'workflow_recipe',
        title: 'Fason Sevk Süreci',
        contentMarkdown: '1. Sevk irsaliyesi kes',
      });

      const res = await service.resolveIntent('Fason Sevk Süreci', 'stock');
      expect(res.matched).toBe(true);
      expect(res.status).toBe('fallback');
      expect(res.recipe?.title).toBe('Fason Sevk Süreci');
    });
  });

  describe('Index bütünlüğü (id-tabanlı dosya eşleşmesi)', () => {
    it('recordEntry index satırını <sub>/<id>.md olarak yazar', async () => {
      const entry = await service.recordEntry({
        scope: 'workspace',
        workspaceId: 'stock',
        category: 'screen_rule',
        title: 'Index Eşleşme Kuralı',
        targetPath: '/stock/retail-sales-report',
        contentMarkdown: '- test kuralı',
      });
      const index = await service.getIndex('stock');
      expect(index).toHaveLength(1);
      expect(index[0].id).toBe(entry.id);
      expect(index[0].relativePath).toBe(`screens/${entry.id}.md`);
    });

    it('reindexWorkspace legacy target-tabanlı satırları onarır', async () => {
      const entry = await service.recordEntry({
        scope: 'workspace',
        workspaceId: 'stock',
        category: 'screen_rule',
        title: 'Legacy Kural',
        targetPath: '/stock/retail-sales-report',
        contentMarkdown: '- legacy',
      });
      await storage.writeIndex('stock', [{
        id: entry.id,
        title: entry.title,
        category: entry.category,
        targetPath: entry.targetPath,
        summary: 'legacy',
        relativePath: 'screens/stock-retail-sales-report.md',
      }]);
      const fixed = await service.reindexWorkspace('stock');
      expect(fixed[0].relativePath).toBe(`screens/${entry.id}.md`);
    });
  });
});

