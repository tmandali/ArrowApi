/**
 * Kurumsal ERP AI Playbook (LLM Wiki & Prosedürel Hafıza Motoru)
 * Andrej Karpathy'nin "LLM Wiki" (Compounding Procedural Memory) yaklaşımının
 * kurumsal arayüz ve raporlama ajanlarına uyarlanmış çekirdek servis implementasyonu.
 */

import { type WorkflowGraphData, PlaybookDAG } from './playbook-graph';

export type PlaybookScope = 'workspace' | 'user';
export type PlaybookCategory = 'screen_rule' | 'workflow_recipe' | 'policy';

export interface PlaybookEntry {
  id: string;
  scope: PlaybookScope;
  workspaceId: string;
  category: PlaybookCategory;
  title: string;
  targetPath?: string;
  contentMarkdown: string;
  graph?: WorkflowGraphData;
  author?: string;
  tags?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface PlaybookIndexItem {
  id: string;
  title: string;
  category: PlaybookCategory;
  targetPath?: string;
  summary: string;
  relativePath: string;
}

export interface PlaybookLogItem {
  timestamp: string;
  action:
    | 'rule_learned'
    | 'recipe_created'
    | 'entry_updated'
    | 'entry_deleted'
    | 'lint_passed';
  title: string;
  targetPath?: string;
  author?: string;
}

export interface IPlaybookStorageAdapter {
  readEntries(workspaceId: string, scope?: PlaybookScope): Promise<PlaybookEntry[]>;
  writeEntry(entry: PlaybookEntry): Promise<void>;
  deleteEntry(id: string, workspaceId: string): Promise<boolean>;
  readIndex(workspaceId: string): Promise<PlaybookIndexItem[]>;
  writeIndex(workspaceId: string, items: PlaybookIndexItem[]): Promise<void>;
  readLog(workspaceId: string): Promise<PlaybookLogItem[]>;
  appendLog(workspaceId: string, item: PlaybookLogItem): Promise<void>;
}

/** Bellek içi test ve varsayılan fallback depolama adaptörü */
export class MemoryPlaybookStorage implements IPlaybookStorageAdapter {
  private entries: Map<string, PlaybookEntry[]> = new Map();
  private indexes: Map<string, PlaybookIndexItem[]> = new Map();
  private logs: Map<string, PlaybookLogItem[]> = new Map();

  async readEntries(workspaceId: string, scope?: PlaybookScope): Promise<PlaybookEntry[]> {
    const list = this.entries.get(workspaceId) || [];
    if (scope) return list.filter((e) => e.scope === scope);
    return list;
  }

  async writeEntry(entry: PlaybookEntry): Promise<void> {
    const list = this.entries.get(entry.workspaceId) || [];
    const idx = list.findIndex((e) => e.id === entry.id);
    if (idx >= 0) {
      list[idx] = entry;
    } else {
      list.push(entry);
    }
    this.entries.set(entry.workspaceId, list);
  }

  async deleteEntry(id: string, workspaceId: string): Promise<boolean> {
    const list = this.entries.get(workspaceId) || [];
    const initialLen = list.length;
    const filtered = list.filter((e) => e.id !== id);
    this.entries.set(workspaceId, filtered);
    return filtered.length < initialLen;
  }

  async readIndex(workspaceId: string): Promise<PlaybookIndexItem[]> {
    return this.indexes.get(workspaceId) || [];
  }

  async writeIndex(workspaceId: string, items: PlaybookIndexItem[]): Promise<void> {
    this.indexes.set(workspaceId, items);
  }

  async readLog(workspaceId: string): Promise<PlaybookLogItem[]> {
    return this.logs.get(workspaceId) || [];
  }

  async appendLog(workspaceId: string, item: PlaybookLogItem): Promise<void> {
    const list = this.logs.get(workspaceId) || [];
    list.push(item);
    this.logs.set(workspaceId, list);
  }

  clear(): void {
    this.entries.clear();
    this.indexes.clear();
    this.logs.clear();
  }
}

/**
 * HTTP REST API tabanlı Playbook deposu adaptörü.
 * Farklı React projelerinin backend endpoint'ine bağlanmasını sağlar.
 */
export class RestPlaybookStorage implements IPlaybookStorageAdapter {
  private endpoint: string;

  constructor(options?: { endpoint?: string }) {
    this.endpoint = options?.endpoint || '/api/agent/playbook';
  }

  async readEntries(workspaceId: string, scope?: PlaybookScope): Promise<PlaybookEntry[]> {
    try {
      const url = new URL(this.endpoint, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
      url.searchParams.set('workspace', workspaceId);
      if (scope) url.searchParams.set('scope', scope);
      const res = await fetch(url.toString());
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data.entries) ? data.entries : [];
    } catch {
      return [];
    }
  }

  async writeEntry(entry: PlaybookEntry): Promise<void> {
    try {
      await fetch(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: entry.id,
          category: entry.category,
          title: entry.title,
          content: entry.contentMarkdown,
          target_path: entry.targetPath,
          workspace: entry.workspaceId,
          scope: entry.scope,
          author: entry.author,
          tags: entry.tags,
        }),
      });
    } catch {
      // Hata durumunda devam et
    }
  }

  async deleteEntry(id: string, workspaceId: string): Promise<boolean> {
    try {
      const url = new URL(this.endpoint, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
      url.searchParams.set('id', id);
      url.searchParams.set('workspace', workspaceId);
      const res = await fetch(url.toString(), { method: 'DELETE' });
      return res.ok;
    } catch {
      return false;
    }
  }

  async readIndex(workspaceId: string): Promise<PlaybookIndexItem[]> {
    try {
      const url = new URL(this.endpoint, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
      url.searchParams.set('workspace', workspaceId);
      url.searchParams.set('type', 'index');
      const res = await fetch(url.toString());
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data.index) ? data.index : [];
    } catch {
      return [];
    }
  }

  async writeIndex(_workspaceId: string, _items: PlaybookIndexItem[]): Promise<void> {
    // Sunucu tarafı index.md'yi writeEntry anında kendisi atomik günceller
  }

  async readLog(workspaceId: string): Promise<PlaybookLogItem[]> {
    try {
      const url = new URL(this.endpoint, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
      url.searchParams.set('workspace', workspaceId);
      url.searchParams.set('type', 'log');
      const res = await fetch(url.toString());
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data.log) ? data.log : [];
    } catch {
      return [];
    }
  }

  async appendLog(_workspaceId: string, _item: PlaybookLogItem): Promise<void> {
    // Sunucu tarafı log.md'yi kendisi append eder
  }
}

/**
 * Tarayıcı LocalStorage tabanlı Playbook adaptörü.
 * Backend'e ihtiyaç duymayan istemci taraflı React projeleri için.
 */
export class LocalStoragePlaybookStorage implements IPlaybookStorageAdapter {
  private prefix: string;

  constructor(prefix = 'my_agent_playbook_') {
    this.prefix = prefix;
  }

  private getKey(workspaceId: string, type: 'entries' | 'index' | 'log'): string {
    return `${this.prefix}${workspaceId}_${type}`;
  }

  async readEntries(workspaceId: string, scope?: PlaybookScope): Promise<PlaybookEntry[]> {
    if (typeof window === 'undefined') return [];
    try {
      const raw = localStorage.getItem(this.getKey(workspaceId, 'entries'));
      const list: PlaybookEntry[] = raw ? JSON.parse(raw) : [];
      return scope ? list.filter((e) => e.scope === scope) : list;
    } catch {
      return [];
    }
  }

  async writeEntry(entry: PlaybookEntry): Promise<void> {
    if (typeof window === 'undefined') return;
    try {
      const entries = await this.readEntries(entry.workspaceId);
      const idx = entries.findIndex((e) => e.id === entry.id);
      if (idx >= 0) entries[idx] = entry;
      else entries.push(entry);
      localStorage.setItem(this.getKey(entry.workspaceId, 'entries'), JSON.stringify(entries));
    } catch {
      // Hata durumunda devam et
    }
  }

  async deleteEntry(id: string, workspaceId: string): Promise<boolean> {
    if (typeof window === 'undefined') return false;
    try {
      const entries = await this.readEntries(workspaceId);
      const filtered = entries.filter((e) => e.id !== id);
      localStorage.setItem(this.getKey(workspaceId, 'entries'), JSON.stringify(filtered));
      return filtered.length < entries.length;
    } catch {
      return false;
    }
  }

  async readIndex(workspaceId: string): Promise<PlaybookIndexItem[]> {
    if (typeof window === 'undefined') return [];
    try {
      const raw = localStorage.getItem(this.getKey(workspaceId, 'index'));
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  async writeIndex(workspaceId: string, items: PlaybookIndexItem[]): Promise<void> {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(this.getKey(workspaceId, 'index'), JSON.stringify(items));
    } catch {
      // Devam et
    }
  }

  async readLog(workspaceId: string): Promise<PlaybookLogItem[]> {
    if (typeof window === 'undefined') return [];
    try {
      const raw = localStorage.getItem(this.getKey(workspaceId, 'log'));
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  async appendLog(workspaceId: string, item: PlaybookLogItem): Promise<void> {
    if (typeof window === 'undefined') return;
    try {
      const logs = await this.readLog(workspaceId);
      logs.push(item);
      localStorage.setItem(this.getKey(workspaceId, 'log'), JSON.stringify(logs));
    } catch {
      // Devam et
    }
  }
}


export class PlaybookService {
  constructor(private adapter: IPlaybookStorageAdapter = new MemoryPlaybookStorage()) {}

  setAdapter(adapter: IPlaybookStorageAdapter) {
    this.adapter = adapter;
  }

  getAdapter(): IPlaybookStorageAdapter {
    return this.adapter;
  }

  /**
   * Aktif rota (örneğin /stock/stock-balance) ile eşleşen ekran kurallarını döner.
   * Model promptuna enjekte edilerek sıfır keşif maliyetiyle doğrudan icra sağlar.
   */
  async getScreenRules(pathname: string, workspaceId: string = 'stock'): Promise<string[]> {
    const cleanPath = pathname.split('?')[0].replace(/\/+$/, '') || '/';
    const entries = await this.adapter.readEntries(workspaceId);

    const rules: string[] = [];
    for (const entry of entries) {
      if (entry.category === 'screen_rule') {
        const target = entry.targetPath?.split('?')[0].replace(/\/+$/, '') || '';
        if (target && (cleanPath === target || cleanPath.startsWith(target))) {
          // Markdown içeriğindeki liste maddelerini veya kural metnini çıkar
          const lines = entry.contentMarkdown
            .split('\n')
            .map((l) => l.trim())
            .filter((l) => l.length > 0 && !l.startsWith('#'));
          rules.push(...lines);
        }
      }
    }
    return rules;
  }

  /**
   * Görev veya sorgu ile eşleşen iş akışı reçetesini (workflow recipe) arar.
   */
  async findRecipe(taskQuery: string, workspaceId: string = 'stock'): Promise<PlaybookEntry | null> {
    const q = taskQuery.toLowerCase().trim();
    if (!q) return null;
    const entries = await this.adapter.readEntries(workspaceId);
    const workflows = entries.filter((e) => e.category === 'workflow_recipe');
    const qWords = q.replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter((w) => w.length >= 3);

    let bestMatch: PlaybookEntry | null = null;
    let maxOverlap = 0;
    for (const wf of workflows) {
      const titleLower = wf.title.toLowerCase();
      if (titleLower.includes(q) || q.includes(titleLower)) return wf;
      const tWords = titleLower.replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter((w) => w.length >= 3);
      const overlap = tWords.filter((tw) => qWords.some((qw) => qw.includes(tw) || tw.includes(qw))).length;
      if (overlap >= 2 && overlap > maxOverlap) {
        maxOverlap = overlap;
        bestMatch = wf;
      }
    }
    if (bestMatch) return bestMatch;
    for (const wf of workflows) {
      if (wf.contentMarkdown.toLowerCase().includes(q)) return wf;
    }
    return null;
  }

  /**
   * Yeni bir kural veya reçeteyi kaydeder.
   * `index.md` kataloğunu günceller ve `log.md` kütüğüne tarihçe satırı ekler.
   */
  async recordEntry(
    input: Omit<PlaybookEntry, 'id' | 'createdAt' | 'updatedAt'> & { id?: string },
  ): Promise<PlaybookEntry> {
    const now = new Date().toISOString();
    const id = input.id || `pb_${input.category}_${Date.now().toString(36)}`;
    const entry: PlaybookEntry = {
      ...input,
      id,
      createdAt: now,
      updatedAt: now,
    };

    await this.adapter.writeEntry(entry);

    // Index güncelleme
    const currentIndex = await this.adapter.readIndex(entry.workspaceId);
    const summary = entry.contentMarkdown
      .replace(/[#*`_]/g, '')
      .split('\n')[0]
      ?.slice(0, 100)
      .trim() || entry.title;

    const relativePath =
      entry.category === 'screen_rule'
        ? `screens/${entry.targetPath?.replace(/^\//, '').replace(/\//g, '-') || 'general'}.md`
        : `workflows/${entry.id}.md`;

    const nextIndex = currentIndex.filter((i) => i.id !== entry.id);
    nextIndex.push({
      id: entry.id,
      title: entry.title,
      category: entry.category,
      targetPath: entry.targetPath,
      summary,
      relativePath,
    });
    await this.adapter.writeIndex(entry.workspaceId, nextIndex);

    // Log ekleme (append-only)
    const logAction =
      entry.category === 'screen_rule' ? 'rule_learned' : 'recipe_created';
    await this.adapter.appendLog(entry.workspaceId, {
      timestamp: now,
      action: logAction,
      title: entry.title,
      targetPath: entry.targetPath,
      author: entry.author || 'Yula Agent',
    });

    return entry;
  }

  /**
   * Bir kuralı veya reçeteyi siler ve index'i temizler.
   */
  async removeEntry(id: string, workspaceId: string): Promise<boolean> {
    const removed = await this.adapter.deleteEntry(id, workspaceId);
    if (removed) {
      const currentIndex = await this.adapter.readIndex(workspaceId);
      await this.adapter.writeIndex(
        workspaceId,
        currentIndex.filter((i) => i.id !== id),
      );
      await this.adapter.appendLog(workspaceId, {
        timestamp: new Date().toISOString(),
        action: 'entry_deleted',
        title: `Entry ${id} deleted`,
      });
    }
    return removed;
  }

  /**
   * Fihristi (index.md) döner.
   */
  async getIndex(workspaceId: string): Promise<PlaybookIndexItem[]> {
    return this.adapter.readIndex(workspaceId);
  }

  /**
   * Denetim izini (log.md) döner.
   */
  async getLog(workspaceId: string): Promise<PlaybookLogItem[]> {
    return this.adapter.readLog(workspaceId);
  }

  /**
   * Çelişen veya eskiyen kayıtları denetler (Karpathy Lint Adımı).
   */
  async lint(workspaceId: string): Promise<{ staleRules: string[]; warnings: string[] }> {
    const entries = await this.adapter.readEntries(workspaceId);
    const warnings: string[] = [];
    const staleRules: string[] = [];

    const pathMap = new Map<string, string[]>();
    for (const e of entries) {
      if (e.targetPath) {
        const existing = pathMap.get(e.targetPath) || [];
        existing.push(e.title);
        pathMap.set(e.targetPath, existing);
      }
      if (!e.contentMarkdown || e.contentMarkdown.trim().length === 0) {
        warnings.push(`Kayıt "${e.title}" (${e.id}) boş içeriğe sahip.`);
      }
      if (e.category === 'workflow_recipe') {
        const dag = e.graph ? new PlaybookDAG(e.graph) : PlaybookDAG.fromMarkdownSteps(e.contentMarkdown);
        if (dag.getAllNodes().length > 0) {
          const res = dag.validate();
          if (!res.valid) warnings.push(...res.errors.map((err) => `İş akışı [${e.title}]: ${err}`));
        }
      }
    }

    return { staleRules, warnings };
  }
}

export const playbookManager = new PlaybookService();
