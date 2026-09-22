/**
 * @file playbook-storage.ts
 * Storage adapters for the Procedural Playbook & LLM Wiki engine.
 * Decoupled from core service to maintain strict modularity and 500-line limits.
 */

import type {
  IPlaybookStorageAdapter,
  PlaybookEntry,
  PlaybookIndexItem,
  PlaybookLogItem,
  PlaybookScope,
} from './playbook';

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
      const res = await fetch(url.toString());
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data.index) ? data.index : [];
    } catch { return []; }
  }
  async writeIndex(ws: string, items: PlaybookIndexItem[]): Promise<void> {
    try {
      await fetch(new URL(`${this.endpoint}/index`, this.getBase()).toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspace: ws, items }),
      });
    } catch {}
  }
  async readLog(ws: string): Promise<PlaybookLogItem[]> {
    try {
      const url = new URL(`${this.endpoint}/log`, this.getBase());
      url.searchParams.set('workspace', ws);
      const res = await fetch(url.toString());
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data.logs) ? data.logs : [];
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
}
