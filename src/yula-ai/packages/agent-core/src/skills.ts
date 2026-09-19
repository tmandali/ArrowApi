export interface Skill {
  name: string;
  description: string;
  instructions: string;
  applicableComponents?: string[];
  applicableRoutes?: string[];
}

/**
 * URL rota yolunu temizler:
 * 1. Query parameter (?page=2) ve Hash (#tab1) kısımlarını atar.
 * 2. Trailing slash normalizasyonu yapar (/orders/ -> /orders).
 */
export function normalizePath(path: string): string {
  if (!path) return '/';
  const clean = path.split('?')[0].split('#')[0].trim();
  const withLeading = clean.startsWith('/') ? clean : `/${clean}`;
  return withLeading.length > 1 && withLeading.endsWith('/') ? withLeading.slice(0, -1) : withLeading;
}

/**
 * Gelişmiş rota kalıbı eşleştirme motoru:
 * - Query param ve hash parçalarını otomatik temizler (?sort=desc, #tab2 vb. eşleşmeyi bozmaz).
 * - '*' tekli segment jokeridir (örn: '/orders/*' -> '/orders/123').
 * - '**' çoklu segment jokeridir (örn: '/admin/**' -> '/admin/users/roles/edit/5').
 * - ':param' dinamik parametreleri yakalar (örn: '/orders/:id', '/users/:userId/orders/:orderId').
 * - '*' veya '**' global olarak tüm rotalarla eşleşir.
 */
export function matchRoutePattern(pattern: string, currentRoute: string): boolean {
  if (!pattern) return false;
  if (pattern === '*' || pattern === '**') return true;

  const cleanTarget = normalizePath(currentRoute);
  const cleanPattern = normalizePath(pattern);

  if (cleanPattern === cleanTarget) return true;

  const regexString = cleanPattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '§§DOUBLE_WILD§§')
    .replace(/\*/g, '[^/]+')
    .replace(/§§DOUBLE_WILD§§/g, '.*')
    .replace(/:[a-zA-Z0-9_]+/g, '[^/]+');

  const regex = new RegExp(`^${regexString}$`);
  return regex.test(cleanTarget);
}

/**
 * Pi-Style Modular Skills System
 * Reference: earendil-works/pi/packages/agent/src/harness/skills.ts
 */
export class SkillRegistry {
  private skills: Map<string, Skill> = new Map();

  constructor() {
    this.registerDefaultSkills();
  }

  registerSkill(skill: Skill): void {
    this.skills.set(skill.name, skill);
  }

  unregisterSkill(name: string): void {
    this.skills.delete(name);
  }

  getSkill(name: string): Skill | undefined {
    return this.skills.get(name);
  }

  getAllSkills(): Skill[] {
    return Array.from(this.skills.values());
  }

  /**
   * Aktif rotaya (query param ve dinamik id'ler temizlenerek/eşleştirilerek)
   * ve ekranda mount edilmiş bileşenlere göre geçerli becerileri filtreler.
   */
  getActiveSkills(currentRoute: string = '/', mountedComponentIds: string[] = []): Skill[] {
    return this.getAllSkills().filter((skill) => {
      const matchRoute =
        !skill.applicableRoutes ||
        skill.applicableRoutes.length === 0 ||
        skill.applicableRoutes.some((pattern) => matchRoutePattern(pattern, currentRoute));
      const matchComponent =
        !skill.applicableComponents ||
        skill.applicableComponents.length === 0 ||
        skill.applicableComponents.some((c) => mountedComponentIds.includes(c));
      return matchRoute && matchComponent;
    });
  }

  /**
   * Becerileri LLM sistem promptuna formatlanmış XML/Markdown bloğu olarak enjekte eder.
   */
  formatSkillsPrompt(currentRoute: string = '/', mountedComponentIds: string[] = []): string {
    const active = this.getActiveSkills(currentRoute, mountedComponentIds);
    if (active.length === 0) return '';

    return [
      '\n<available_ui_skills>',
      'The following skill guides provide instructions for interacting with components on this screen:',
      ...active.map(
        (s) => `
<skill name="${s.name}">
<description>${s.description}</description>
<instructions>
${s.instructions}
</instructions>
</skill>`
      ),
      '</available_ui_skills>\n',
    ].join('\n');
  }

  private registerDefaultSkills(): void {
    this.registerSkill({
      name: 'sales-report-workflow',
      description: 'Satış & Stok Raporu oluşturma ve kriter belirleme kılavuzu',
      applicableComponents: ['filter_form'],
      instructions: `
- Raporu oluşturmak için 'filter_form' bileşenine SET_FIELDS komutu ile storeId (örn: Kadıköy) ve dateRange (örn: 2026-09) alanlarını gönder.
- Ardından SUBMIT aksiyonunu çağırarak raporu oluştur.
- Her iki alan da zorunludur; biri eksikse asla SUBMIT çağırma.
`,
    });

    this.registerSkill({
      name: 'validation-recovery',
      description: 'Eksik alan veya validasyon hatası sonrası kurtarma stratejisi',
      applicableComponents: ['filter_form'],
      instructions: `
- Eğer SUBMIT işlemi 'VALIDATION_FAILED' hatası alırsa, eksik alanları (storeId veya dateRange) kullanıcıya nazikçe açıkla.
- Eğer kullanıcı tarih belirtmediyse, '2026-09' varsayılan dönemini öner veya otomatik tamamlayıp onay iste.
`,
    });

    this.registerSkill({
      name: 'grid-analysis-export',
      description: 'Sonuç tablosu filtreleme, sıralama ve CSV dışa aktarma kılavuzu',
      applicableComponents: ['result_table'],
      instructions: `
- Tablo ekranda mount olduğunda (result_table), sonuçları azalan veya artan sırada sıralamak için action='SORT', payload={ direction: 'desc' | 'asc' } komutunu kullan.
- Kullanıcı Excel/CSV istediğinde action='EXPORT_CSV' eylemini tetikle.
`,
    });
  }
}

export const skillsManager = new SkillRegistry();
