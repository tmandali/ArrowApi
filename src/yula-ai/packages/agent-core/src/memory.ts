import { StorageAdapter } from './types';

export type MemoryScope = 'session' | 'persistent';

export interface MemoryEntry {
  key: string;
  value: any;
  scope: MemoryScope;
  description?: string;
  updatedAt: number;
}

export interface AgentMemoryOptions {
  storage?: StorageAdapter;
  persistentStorageKey?: string;
  defaultMemories?: Array<{ key: string; value: any; scope?: MemoryScope; description?: string }>;
}

class LocalStorageAdapter implements StorageAdapter {
  getItem(key: string): string | null {
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        return window.localStorage.getItem(key);
      } catch {
        return null;
      }
    }
    return null;
  }

  setItem(key: string, value: string): void {
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        window.localStorage.setItem(key, value);
      } catch (e) {
        console.warn('[LocalStorageAdapter] setItem error:', e);
      }
    }
  }

  removeItem(key: string): void {
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        window.localStorage.removeItem(key);
      } catch (e) {
        console.warn('[LocalStorageAdapter] removeItem error:', e);
      }
    }
  }

  clear(): void {
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        window.localStorage.clear();
      } catch {}
    }
  }
}

class MemoryStorageAdapter implements StorageAdapter {
  private store = new Map<string, string>();

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }
}

/**
 * Pi-Style Agent Memory System
 * Reference: earendil-works/pi/packages/agent/src/harness/memory/
 * 
 * Katmanlar:
 * 1. Session Memory: Oturum boyunca geçerli geçici bellek (scratchpad)
 * 2. Persistent Memory: StorageAdapter ile tarayıcıda/istemcide kalıcı kullanıcı tercihleri
 * 3. Tool Execution Memoization: Aynı parametrelerle çalışan pahalı araç sonuçlarını önbelleğe alma
 */
export class AgentMemory {
  private sessionStore: Map<string, MemoryEntry> = new Map();
  private persistentStorageKey: string;
  private storage: StorageAdapter;
  private toolCache: Map<string, { result: any; expiresAt: number }> = new Map();
  private listeners: Set<() => void> = new Set();
  private cachedAll?: MemoryEntry[];

  constructor(options?: AgentMemoryOptions) {
    this.persistentStorageKey = options?.persistentStorageKey || '__my_agent_persistent_memory__';
    this.storage =
      options?.storage ||
      (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
        ? new LocalStorageAdapter()
        : new MemoryStorageAdapter());

    this.initDefaultMemories(options?.defaultMemories);
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    this.cachedAll = undefined;
    this.listeners.forEach((listener) => {
      try {
        listener();
      } catch (err) {
        console.error('[AgentMemory] Listener error:', err);
      }
    });
  }

  private getPersistentEntries(): Map<string, MemoryEntry> {
    const map = new Map<string, MemoryEntry>();
    try {
      const raw = this.storage.getItem(this.persistentStorageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        for (const item of parsed) {
          map.set(item.key, item);
        }
      }
    } catch (e) {
      console.warn('[AgentMemory] Persistent memory okuma hatası:', e);
    }
    return map;
  }

  private savePersistentEntries(entries: MemoryEntry[]): void {
    try {
      this.storage.setItem(this.persistentStorageKey, JSON.stringify(entries));
    } catch (e) {
      console.warn('[AgentMemory] Persistent memory kaydetme hatası:', e);
    }
  }

  /**
   * Bir bilgiyi veya kullanıcı tercihini hafızaya yazar.
   */
  remember(key: string, value: any, scope: MemoryScope = 'session', description?: string): void {
    const entry: MemoryEntry = {
      key,
      value,
      scope,
      description,
      updatedAt: Date.now(),
    };

    if (scope === 'session') {
      this.sessionStore.set(key, entry);
    } else {
      const persistent = this.getPersistentEntries();
      persistent.set(key, entry);
      this.savePersistentEntries(Array.from(persistent.values()));
    }

    this.notify();
  }

  /**
   * Hafızadan bir anahtara ait değeri okur.
   */
  recall<T = any>(key: string): T | undefined {
    if (this.sessionStore.has(key)) {
      return this.sessionStore.get(key)?.value;
    }
    const persistent = this.getPersistentEntries();
    if (persistent.has(key)) {
      return persistent.get(key)?.value;
    }
    return undefined;
  }

  /**
   * Hafızadan bir kaydı siler.
   */
  forget(key: string): boolean {
    let deleted = false;
    if (this.sessionStore.has(key)) {
      this.sessionStore.delete(key);
      deleted = true;
    }
    const persistent = this.getPersistentEntries();
    if (persistent.has(key)) {
      persistent.delete(key);
      this.savePersistentEntries(Array.from(persistent.values()));
      deleted = true;
    }
    if (deleted) {
      this.notify();
    }
    return deleted;
  }

  /**
   * Tüm kayıtlı bellek girdilerini döner.
   */
  getAll(scope?: MemoryScope): MemoryEntry[] {
    const sessionList = Array.from(this.sessionStore.values());
    const persistentList = Array.from(this.getPersistentEntries().values());

    if (scope === 'session') return sessionList;
    if (scope === 'persistent') return persistentList;

    if (!this.cachedAll) {
      const combined = new Map<string, MemoryEntry>();
      for (const item of persistentList) combined.set(item.key, item);
      for (const item of sessionList) combined.set(item.key, item);
      this.cachedAll = Array.from(combined.values());
    }
    return this.cachedAll;
  }

  /**
   * Hafızayı sıfırlar.
   */
  clear(scope: 'session' | 'persistent' | 'all' = 'all'): void {
    if (scope === 'session' || scope === 'all') {
      this.sessionStore.clear();
    }
    if (scope === 'persistent' || scope === 'all') {
      try {
        this.storage.removeItem(this.persistentStorageKey);
      } catch {}
    }
    this.notify();
  }

  /**
   * LLM sistem promptuna enjekte edilmek üzere biçimlendirilmiş hafıza bloğu üretir.
   */
  formatMemoryPrompt(): string {
    const entries = this.getAll();
    if (entries.length === 0) return '';

    return [
      '\n<agent_memory>',
      'The following information represents the user\'s preferences and persistent memories:',
      ...entries.map(
        (e) => `- ${e.key}: ${JSON.stringify(e.value)}${e.description ? ` (${e.description})` : ''} [${e.scope}]`
      ),
      '</agent_memory>\n',
    ].join('\n');
  }

  /**
   * Araç Yürütme Önbelleği (Tool Execution Cache)
   */
  memoizeToolResult(toolName: string, args: any, result: any, ttlMs: number = 60000): void {
    const cacheKey = `${toolName}:${JSON.stringify(args)}`;
    this.toolCache.set(cacheKey, {
      result,
      expiresAt: Date.now() + ttlMs,
    });
  }

  getCachedToolResult(toolName: string, args: any): any | undefined {
    const cacheKey = `${toolName}:${JSON.stringify(args)}`;
    const cached = this.toolCache.get(cacheKey);
    if (!cached) return undefined;

    if (Date.now() > cached.expiresAt) {
      this.toolCache.delete(cacheKey);
      return undefined;
    }
    return cached.result;
  }

  clearToolCache(): void {
    this.toolCache.clear();
  }

  private initDefaultMemories(
    customDefaults?: Array<{ key: string; value: any; scope?: MemoryScope; description?: string }>
  ): void {
    const existing = this.getPersistentEntries();

    if (customDefaults && customDefaults.length > 0) {
      for (const item of customDefaults) {
        if (!existing.has(item.key)) {
          this.remember(item.key, item.value, item.scope || 'persistent', item.description);
        }
      }
      return;
    }

    // Geriye dönük uyumluluk varsayılanları
    if (!existing.has('preferred_store')) {
      this.remember('preferred_store', 'Kadıköy', 'persistent', 'Kullanıcının varsayılan şube tercihi');
    }
    if (!existing.has('currency')) {
      this.remember('currency', 'TRY', 'persistent', 'Varsayılan para birimi');
    }
    if (!existing.has('language')) {
      this.remember('language', 'tr', 'persistent', 'Tercih edilen dil');
    }
  }
}

export const agentMemory = new AgentMemory();
