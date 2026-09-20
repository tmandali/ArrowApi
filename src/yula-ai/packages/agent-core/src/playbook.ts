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
  status?: 'draft' | 'approved' | 'rejected';
  proposedBy?: string;
  reviewedBy?: string;
  changeSummary?: string;
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
    | 'lint_passed'
    | 'proposal_created'
    | 'proposal_approved'
    | 'proposal_rejected';
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
  readProposals?(workspaceId: string): Promise<PlaybookEntry[]>;
  writeProposal?(entry: PlaybookEntry): Promise<void>;
  approveProposal?(id: string, workspaceId: string, reviewer?: string): Promise<PlaybookEntry | null>;
  rejectProposal?(id: string, workspaceId: string, reason?: string): Promise<boolean>;
}

/** Bellek içi test ve varsayılan fallback depolama adaptörü */
export class MemoryPlaybookStorage implements IPlaybookStorageAdapter {
  private entries = new Map<string, PlaybookEntry[]>();
  private proposals = new Map<string, PlaybookEntry[]>();
  private indexes = new Map<string, PlaybookIndexItem[]>();
  private logs = new Map<string, PlaybookLogItem[]>();

  async readEntries(ws: string, scope?: PlaybookScope): Promise<PlaybookEntry[]> {
    const list = this.entries.get(ws) || [];
    return scope ? list.filter((e) => e.scope === scope) : [...list];
  }
  async writeEntry(entry: PlaybookEntry): Promise<void> {
    const list = this.entries.get(entry.workspaceId) || [];
    const idx = list.findIndex((e) => e.id === entry.id);
    if (idx >= 0) list[idx] = entry; else list.push(entry);
    this.entries.set(entry.workspaceId, list);
  }
  async deleteEntry(id: string, ws: string): Promise<boolean> {
    const list = this.entries.get(ws) || [];
    const filtered = list.filter((e) => e.id !== id);
    this.entries.set(ws, filtered);
    return filtered.length < list.length;
  }
  async readIndex(ws: string): Promise<PlaybookIndexItem[]> { return this.indexes.get(ws) || []; }
  async writeIndex(ws: string, items: PlaybookIndexItem[]): Promise<void> { this.indexes.set(ws, items); }
  async readLog(ws: string): Promise<PlaybookLogItem[]> { return this.logs.get(ws) || []; }
  async appendLog(ws: string, item: PlaybookLogItem): Promise<void> {
    const list = this.logs.get(ws) || [];
    list.push(item);
    this.logs.set(ws, list);
  }
  async readProposals(ws: string): Promise<PlaybookEntry[]> { return [...(this.proposals.get(ws) || [])]; }
  async writeProposal(entry: PlaybookEntry): Promise<void> {
    const list = this.proposals.get(entry.workspaceId) || [];
    const idx = list.findIndex((e) => e.id === entry.id);
    const draft = { ...entry, status: 'draft' as const };
    if (idx >= 0) list[idx] = draft; else list.push(draft);
    this.proposals.set(entry.workspaceId, list);
  }
  async approveProposal(id: string, ws: string, reviewer?: string): Promise<PlaybookEntry | null> {
    const list = this.proposals.get(ws) || [];
    const idx = list.findIndex((e) => e.id === id);
    if (idx < 0) return null;
    const [target] = list.splice(idx, 1);
    this.proposals.set(ws, list);
    const approved: PlaybookEntry = { ...target, status: 'approved', reviewedBy: reviewer || 'Admin', updatedAt: new Date().toISOString() };
    await this.writeEntry(approved);
    await this.appendLog(ws, { timestamp: new Date().toISOString(), action: 'proposal_approved', title: approved.title, targetPath: approved.targetPath, author: reviewer || 'Admin' });
    return approved;
  }
  async rejectProposal(id: string, ws: string, _reason?: string): Promise<boolean> {
    const list = this.proposals.get(ws) || [];
    const idx = list.findIndex((e) => e.id === id);
    if (idx < 0) return false;
    const [target] = list.splice(idx, 1);
    this.proposals.set(ws, list);
    await this.appendLog(ws, { timestamp: new Date().toISOString(), action: 'proposal_rejected', title: target.title, targetPath: target.targetPath, author: 'Admin' });
    return true;
  }
  clear(): void {
    this.entries.clear();
    this.proposals.clear();
    this.indexes.clear();
    this.logs.clear();
  }
}

/** HTTP REST API tabanlı Playbook deposu adaptörü */
export class RestPlaybookStorage implements IPlaybookStorageAdapter {
  private endpoint: string;
  constructor(options?: { endpoint?: string }) { this.endpoint = options?.endpoint || '/api/agent/playbook'; }
  private getBase(): string { return typeof window !== 'undefined' ? window.location.origin : 'http://localhost'; }

  async readEntries(ws: string, scope?: PlaybookScope): Promise<PlaybookEntry[]> {
    try {
      const url = new URL(this.endpoint, this.getBase());
      url.searchParams.set('workspace', ws);
      if (scope) url.searchParams.set('scope', scope);
      const res = await fetch(url.toString());
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data.entries) ? data.entries : [];
    } catch { return []; }
  }
  async writeEntry(entry: PlaybookEntry): Promise<void> {
    try {
      await fetch(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: entry.id, category: entry.category, title: entry.title,
          content: entry.contentMarkdown, target_path: entry.targetPath,
          workspace: entry.workspaceId, scope: entry.scope,
          author: entry.author, tags: entry.tags,
        }),
      });
    } catch {}
  }
  async deleteEntry(id: string, ws: string): Promise<boolean> {
    try {
      const url = new URL(this.endpoint, this.getBase());
      url.searchParams.set('id', id);
      url.searchParams.set('workspace', ws);
      const res = await fetch(url.toString(), { method: 'DELETE' });
      return res.ok;
    } catch { return false; }
  }
  async readIndex(ws: string): Promise<PlaybookIndexItem[]> {
    try {
      const url = new URL(this.endpoint, this.getBase());
      url.searchParams.set('workspace', ws);
      url.searchParams.set('type', 'index');
      const res = await fetch(url.toString());
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data.index) ? data.index : [];
    } catch { return []; }
  }
  async writeIndex(_ws: string, _items: PlaybookIndexItem[]): Promise<void> {}
  async readLog(ws: string): Promise<PlaybookLogItem[]> {
    try {
      const url = new URL(this.endpoint, this.getBase());
      url.searchParams.set('workspace', ws);
      url.searchParams.set('type', 'log');
      const res = await fetch(url.toString());
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data.log) ? data.log : [];
    } catch { return []; }
  }
  async appendLog(_ws: string, _item: PlaybookLogItem): Promise<void> {}
  async readProposals(ws: string): Promise<PlaybookEntry[]> {
    try {
      const url = new URL(`${this.endpoint}/proposals`, this.getBase());
      url.searchParams.set('workspace', ws);
      const res = await fetch(url.toString());
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data.proposals) ? data.proposals : [];
    } catch { return []; }
  }
  async writeProposal(entry: PlaybookEntry): Promise<void> {
    try {
      await fetch(new URL(`${this.endpoint}/proposals`, this.getBase()).toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create', ...entry }),
      });
    } catch {}
  }
  async approveProposal(id: string, ws: string, reviewer?: string): Promise<PlaybookEntry | null> {
    try {
      const res = await fetch(new URL(`${this.endpoint}/proposals`, this.getBase()).toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve', id, workspace: ws, reviewer }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      return data.entry || null;
    } catch { return null; }
  }
  async rejectProposal(id: string, ws: string, reason?: string): Promise<boolean> {
    try {
      const res = await fetch(new URL(`${this.endpoint}/proposals`, this.getBase()).toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reject', id, workspace: ws, reason }),
      });
      return res.ok;
    } catch { return false; }
  }
}

/** Tarayıcı LocalStorage tabanlı Playbook adaptörü */
export class LocalStoragePlaybookStorage implements IPlaybookStorageAdapter {
  constructor(private prefix = 'my_agent_playbook_') {}
  private k(ws: string, type: string) { return `${this.prefix}${ws}_${type}`; }

  async readEntries(ws: string, scope?: PlaybookScope): Promise<PlaybookEntry[]> {
    if (typeof window === 'undefined') return [];
    try {
      const raw = localStorage.getItem(this.k(ws, 'entries'));
      const list: PlaybookEntry[] = raw ? JSON.parse(raw) : [];
      return scope ? list.filter((e) => e.scope === scope) : list;
    } catch { return []; }
  }
  async writeEntry(entry: PlaybookEntry): Promise<void> {
    if (typeof window === 'undefined') return;
    try {
      const list = await this.readEntries(entry.workspaceId);
      const idx = list.findIndex((e) => e.id === entry.id);
      if (idx >= 0) list[idx] = entry; else list.push(entry);
      localStorage.setItem(this.k(entry.workspaceId, 'entries'), JSON.stringify(list));
    } catch {}
  }
  async deleteEntry(id: string, ws: string): Promise<boolean> {
    if (typeof window === 'undefined') return false;
    try {
      const list = await this.readEntries(ws);
      const filtered = list.filter((e) => e.id !== id);
      localStorage.setItem(this.k(ws, 'entries'), JSON.stringify(filtered));
      return filtered.length < list.length;
    } catch { return false; }
  }
  async readIndex(ws: string): Promise<PlaybookIndexItem[]> {
    if (typeof window === 'undefined') return [];
    try {
      const raw = localStorage.getItem(this.k(ws, 'index'));
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  }
  async writeIndex(ws: string, items: PlaybookIndexItem[]): Promise<void> {
    if (typeof window === 'undefined') return;
    try { localStorage.setItem(this.k(ws, 'index'), JSON.stringify(items)); } catch {}
  }
  async readLog(ws: string): Promise<PlaybookLogItem[]> {
    if (typeof window === 'undefined') return [];
    try {
      const raw = localStorage.getItem(this.k(ws, 'log'));
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  }
  async appendLog(ws: string, item: PlaybookLogItem): Promise<void> {
    if (typeof window === 'undefined') return;
    try {
      const logs = await this.readLog(ws);
      logs.push(item);
      localStorage.setItem(this.k(ws, 'log'), JSON.stringify(logs));
    } catch {}
  }
  async readProposals(ws: string): Promise<PlaybookEntry[]> {
    if (typeof window === 'undefined') return [];
    try {
      const raw = localStorage.getItem(this.k(ws, 'proposals'));
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  }
  async writeProposal(entry: PlaybookEntry): Promise<void> {
    if (typeof window === 'undefined') return;
    try {
      const list = await this.readProposals(entry.workspaceId);
      const idx = list.findIndex((e) => e.id === entry.id);
      const draft = { ...entry, status: 'draft' as const };
      if (idx >= 0) list[idx] = draft; else list.push(draft);
      localStorage.setItem(this.k(entry.workspaceId, 'proposals'), JSON.stringify(list));
    } catch {}
  }
  async approveProposal(id: string, ws: string, reviewer?: string): Promise<PlaybookEntry | null> {
    if (typeof window === 'undefined') return null;
    const list = await this.readProposals(ws);
    const idx = list.findIndex((e) => e.id === id);
    if (idx < 0) return null;
    const [target] = list.splice(idx, 1);
    localStorage.setItem(this.k(ws, 'proposals'), JSON.stringify(list));
    const approved: PlaybookEntry = { ...target, status: 'approved', reviewedBy: reviewer || 'Admin', updatedAt: new Date().toISOString() };
    await this.writeEntry(approved);
    return approved;
  }
  async rejectProposal(id: string, ws: string): Promise<boolean> {
    if (typeof window === 'undefined') return false;
    const list = await this.readProposals(ws);
    const filtered = list.filter((e) => e.id !== id);
    localStorage.setItem(this.k(ws, 'proposals'), JSON.stringify(filtered));
    return filtered.length < list.length;
  }
}

export class PlaybookService {
  constructor(private adapter: IPlaybookStorageAdapter = new MemoryPlaybookStorage()) {}
  setAdapter(adapter: IPlaybookStorageAdapter) { this.adapter = adapter; }
  getAdapter(): IPlaybookStorageAdapter { return this.adapter; }

  async getScreenRules(pathname: string, workspaceId: string = 'stock'): Promise<string[]> {
    const cleanPath = pathname.split('?')[0].replace(/\/+$/, '') || '/';
    const allEntries = await this.adapter.readEntries(workspaceId);
    const entries = allEntries.filter((e) => e.status !== 'draft');
    const rules: string[] = [];
    for (const entry of entries) {
      if (entry.category === 'screen_rule') {
        const target = entry.targetPath?.split('?')[0].replace(/\/+$/, '') || '';
        if (target && (cleanPath === target || cleanPath.startsWith(target))) {
          const lines = entry.contentMarkdown.split('\n').map((l) => l.trim()).filter((l) => l.length > 0 && !l.startsWith('#'));
          rules.push(...lines);
        }
      }
    }
    return rules;
  }

  async findRecipe(taskQuery: string, workspaceId: string = 'stock'): Promise<PlaybookEntry | null> {
    const q = taskQuery.toLowerCase().trim();
    if (!q) return null;
    const allEntries = await this.adapter.readEntries(workspaceId);
    const workflows = allEntries.filter((e) => e.category === 'workflow_recipe' && e.status !== 'draft');
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

  async recordEntry(input: Omit<PlaybookEntry, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<PlaybookEntry> {
    const now = new Date().toISOString();
    const id = input.id || `pb_${input.category}_${Date.now().toString(36)}`;
    const entry: PlaybookEntry = { ...input, id, status: input.status || 'approved', createdAt: now, updatedAt: now };
    await this.adapter.writeEntry(entry);
    const currentIndex = await this.adapter.readIndex(entry.workspaceId);
    const summary = entry.contentMarkdown.replace(/[#*`_]/g, '').split('\n')[0]?.slice(0, 100).trim() || entry.title;
    const relativePath = entry.category === 'screen_rule'
      ? `screens/${entry.targetPath?.replace(/^\//, '').replace(/\//g, '-') || 'general'}.md`
      : `workflows/${entry.id}.md`;
    const nextIndex = currentIndex.filter((i) => i.id !== entry.id);
    nextIndex.push({ id: entry.id, title: entry.title, category: entry.category, targetPath: entry.targetPath, summary, relativePath });
    await this.adapter.writeIndex(entry.workspaceId, nextIndex);
    const logAction = entry.category === 'screen_rule' ? 'rule_learned' : 'recipe_created';
    await this.adapter.appendLog(entry.workspaceId, {
      timestamp: now, action: logAction, title: entry.title, targetPath: entry.targetPath, author: entry.author || 'Yula Agent',
    });
    return entry;
  }

  async proposeEntry(input: Omit<PlaybookEntry, 'id' | 'createdAt' | 'updatedAt' | 'status'> & { id?: string }): Promise<PlaybookEntry> {
    const now = new Date().toISOString();
    const id = input.id || `prop_${input.category}_${Date.now().toString(36)}`;
    const entry: PlaybookEntry = { ...input, id, status: 'draft', createdAt: now, updatedAt: now };
    if (this.adapter.writeProposal) await this.adapter.writeProposal(entry);
    else await this.adapter.writeEntry(entry);
    await this.adapter.appendLog(entry.workspaceId, {
      timestamp: now, action: 'proposal_created', title: entry.title, targetPath: entry.targetPath, author: entry.proposedBy || entry.author || 'User',
    });
    return entry;
  }

  async getProposals(workspaceId: string = 'stock'): Promise<PlaybookEntry[]> {
    if (this.adapter.readProposals) return this.adapter.readProposals(workspaceId);
    const all = await this.adapter.readEntries(workspaceId);
    return all.filter((e) => e.status === 'draft');
  }

  async approveProposal(id: string, workspaceId: string = 'stock', reviewer: string = 'Admin'): Promise<PlaybookEntry | null> {
    if (this.adapter.approveProposal) {
      const approved = await this.adapter.approveProposal(id, workspaceId, reviewer);
      if (approved) {
        const currentIndex = await this.adapter.readIndex(workspaceId);
        const summary = approved.contentMarkdown.replace(/[#*`_]/g, '').split('\n')[0]?.slice(0, 100).trim() || approved.title;
        const relativePath = approved.category === 'screen_rule'
          ? `screens/${approved.targetPath?.replace(/^\//, '').replace(/\//g, '-') || 'general'}.md`
          : `workflows/${approved.id}.md`;
        const nextIndex = currentIndex.filter((i) => i.id !== approved.id);
        nextIndex.push({ id: approved.id, title: approved.title, category: approved.category, targetPath: approved.targetPath, summary, relativePath });
        await this.adapter.writeIndex(workspaceId, nextIndex);
      }
      return approved;
    }
    return null;
  }

  async rejectProposal(id: string, workspaceId: string = 'stock', reason?: string): Promise<boolean> {
    if (this.adapter.rejectProposal) return this.adapter.rejectProposal(id, workspaceId, reason);
    return false;
  }

  async removeEntry(id: string, workspaceId: string): Promise<boolean> {
    const removed = await this.adapter.deleteEntry(id, workspaceId);
    if (removed) {
      const currentIndex = await this.adapter.readIndex(workspaceId);
      await this.adapter.writeIndex(workspaceId, currentIndex.filter((i) => i.id !== id));
      await this.adapter.appendLog(workspaceId, { timestamp: new Date().toISOString(), action: 'entry_deleted', title: `Entry ${id} deleted` });
    }
    return removed;
  }

  async getIndex(workspaceId: string): Promise<PlaybookIndexItem[]> { return this.adapter.readIndex(workspaceId); }
  async getLog(workspaceId: string): Promise<PlaybookLogItem[]> { return this.adapter.readLog(workspaceId); }

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
