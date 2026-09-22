export interface StoredSessionRecord {
  sessionId: string;
  updatedAt: number;
  data: any;
  byteSize?: number;
}

export class IndexedDBSessionDriver {
  private dbName = 'pi_agent_storage_v1';
  private storeName = 'sessions';
  private db: IDBDatabase | null = null;
  private fallbackStorage: Map<string, any> = new Map();

  async init(): Promise<boolean> {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return false;
    }

    if (this.db) return true;

    return new Promise((resolve) => {
      try {
        const req = window.indexedDB.open(this.dbName, 1);

        req.onupgradeneeded = (e) => {
          const db = (e.target as IDBOpenDBRequest).result;
          if (!db.objectStoreNames.contains(this.storeName)) {
            db.createObjectStore(this.storeName, { keyPath: 'sessionId' });
          }
        };

        req.onsuccess = (e) => {
          this.db = (e.target as IDBOpenDBRequest).result;
          resolve(true);
        };

        req.onerror = () => {
          console.warn('[IndexedDBSessionDriver] IndexedDB açılamadı, fallback kullanılıyor.');
          resolve(false);
        };
      } catch (err) {
        resolve(false);
      }
    });
  }

  async saveSession(sessionId: string, data: any): Promise<boolean> {
    const ready = await this.init();
    const serialized = JSON.stringify(data);
    const byteSize = new TextEncoder().encode(serialized).length;

    const record: StoredSessionRecord = {
      sessionId,
      updatedAt: Date.now(),
      data,
      byteSize,
    };

    if (!ready || !this.db) {
      this.fallbackStorage.set(sessionId, record);
      return true;
    }

    return new Promise((resolve) => {
      try {
        const tx = this.db!.transaction(this.storeName, 'readwrite');
        const store = tx.objectStore(this.storeName);
        store.put(record);

        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch (err) {
        this.fallbackStorage.set(sessionId, record);
        resolve(true);
      }
    });
  }

  async loadSession(sessionId: string): Promise<any | null> {
    const ready = await this.init();

    if (!ready || !this.db) {
      const rec = this.fallbackStorage.get(sessionId);
      return rec ? rec.data : null;
    }

    return new Promise((resolve) => {
      try {
        const tx = this.db!.transaction(this.storeName, 'readonly');
        const store = tx.objectStore(this.storeName);
        const req = store.get(sessionId);

        req.onsuccess = () => {
          const res = req.result as StoredSessionRecord;
          resolve(res ? res.data : null);
        };
        req.onerror = () => resolve(null);
      } catch (err) {
        const rec = this.fallbackStorage.get(sessionId);
        resolve(rec ? rec.data : null);
      }
    });
  }

  async listSessions(): Promise<StoredSessionRecord[]> {
    const ready = await this.init();

    if (!ready || !this.db) {
      return Array.from(this.fallbackStorage.values());
    }

    return new Promise((resolve) => {
      try {
        const tx = this.db!.transaction(this.storeName, 'readonly');
        const store = tx.objectStore(this.storeName);
        const req = store.getAll();

        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve(Array.from(this.fallbackStorage.values()));
      } catch (err) {
        resolve(Array.from(this.fallbackStorage.values()));
      }
    });
  }

  async deleteSession(sessionId: string): Promise<boolean> {
    this.fallbackStorage.delete(sessionId);
    if (!this.db) return true;

    return new Promise((resolve) => {
      try {
        const tx = this.db!.transaction(this.storeName, 'readwrite');
        const store = tx.objectStore(this.storeName);
        store.delete(sessionId);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch (err) {
        resolve(true);
      }
    });
  }

  clear(): void {
    this.fallbackStorage.clear();
    if (this.db) {
      try {
        const tx = this.db.transaction(this.storeName, 'readwrite');
        tx.objectStore(this.storeName).clear();
      } catch (err) {
        // yoksay
      }
    }
  }
}

export const indexedDbDriver = new IndexedDBSessionDriver();
