/**
 * Kurumsal ERP AI Playbook (LLM Wiki & Prosedürel Hafıza Motoru)
 * Andrej Karpathy'nin "LLM Wiki" (Compounding Procedural Memory) yaklaşımının
 * kurumsal arayüz ve raporlama ajanlarına uyarlanmış çekirdek servis implementasyonu.
 */

import { type WorkflowGraphData, PlaybookDAG } from './playbook-graph';
import { MemoryPlaybookStorage } from './playbook-storage';

export * from './playbook-storage';

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

export interface PlaybookRetrievalResolution {
  status: 'ok' | 'not_found' | 'fallback';
  matched: boolean;
  confidence: number;
  recipe?: PlaybookEntry | null;
  screenRules?: string[];
  relevantIndex?: PlaybookIndexItem[];
  explanation: string;
}

export type PlaybookSubagentResolver = (
  taskQuery: string,
  workspaceId: string,
) => Promise<PlaybookRetrievalResolution | null>;

/**
 * Ana Playbook Servisi: Prosedürel hafıza okuma, yazma, linting ve sorgu yönlendirme.
 */
export class PlaybookService {
  private adapter: IPlaybookStorageAdapter;
  private subagentResolver?: PlaybookSubagentResolver;

  constructor(adapter?: IPlaybookStorageAdapter) {
    this.adapter = adapter || new MemoryPlaybookStorage();
  }

  setAdapter(adapter: IPlaybookStorageAdapter) { this.adapter = adapter; }
  getAdapter(): IPlaybookStorageAdapter { return this.adapter; }

  setSubagentResolver(resolver: PlaybookSubagentResolver | undefined): this {
    this.subagentResolver = resolver;
    return this;
  }

  getSubagentResolver(): PlaybookSubagentResolver | undefined {
    return this.subagentResolver;
  }

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

  async resolveIntent(taskQuery: string, workspaceId: string = 'stock'): Promise<PlaybookRetrievalResolution> {
    const q = taskQuery.trim();
    if (!q) {
      return {
        status: 'not_found',
        matched: false,
        confidence: 0,
        recipe: null,
        screenRules: [],
        relevantIndex: [],
        explanation: 'Empty task query provided.',
      };
    }

    // 1. Varsa tescilli alt ajan çözümleyicisini çalıştır
    if (this.subagentResolver) {
      try {
        const subResult = await this.subagentResolver(q, workspaceId);
        if (subResult) return subResult;
      } catch (err) {
        console.warn('⚠️ [PlaybookService] Sub-agent resolver failed, falling back:', err);
      }
    }

    // 2. Deterministik yerel arama güvencesi (Pi Grounding)
    const screenRules = await this.getScreenRules(q, workspaceId);
    const recipe = await this.findRecipe(q, workspaceId);
    const allIndex = await this.getIndex(workspaceId);
    const relevantIndex = allIndex.filter(
      (i) =>
        i.title.toLowerCase().includes(q.toLowerCase()) ||
        (i.targetPath && i.targetPath.toLowerCase().includes(q.toLowerCase())) ||
        (i.summary && i.summary.toLowerCase().includes(q.toLowerCase())),
    );

    if (recipe) {
      return {
        status: 'fallback',
        matched: true,
        confidence: 0.75,
        recipe,
        screenRules,
        relevantIndex: relevantIndex.length > 0 ? relevantIndex : allIndex.filter((i) => i.id === recipe.id),
        explanation: `Matched recipe "${recipe.title}" via local deterministic search.`,
      };
    }

    return {
      status: 'not_found',
      matched: false,
      confidence: 0,
      recipe: null,
      screenRules,
      relevantIndex,
      explanation: `No verified playbook recipe found for "${taskQuery}" in workspace "${workspaceId}".`,
    };
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
