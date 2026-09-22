import type { SessionDump } from '../harness/session/session-harness';
import type { SessionCheckpoint } from '../types';

function getDatabaseSync(): any {
  try {
    if (typeof process !== 'undefined') {
      if (typeof (process as any).getBuiltinModule === 'function') {
        const mod = (process as any).getBuiltinModule('node:sqlite');
        if (mod?.DatabaseSync) return mod.DatabaseSync;
      }
      if (typeof require === 'function') {
        const mod = require('node:sqlite');
        return mod?.DatabaseSync ?? null;
      }
    }
    return null;
  } catch {
    return null;
  }
}

export interface SqliteSessionRecord {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  activeBranch: string;
  checkpointCount: number;
  byteSize: number;
  metadata?: Record<string, any>;
}

export interface SqliteSessionDriverOptions {
  dbPath?: string;
  enableWal?: boolean;
}

/**
 * Node 22 native SQLite session storage backend.
 * Provides fast, zero-dependency, crash-safe ACID persistence for sessions and checkpoints.
 * Reference: reference-pi session repository & SQLite storage patterns.
 */
export class SqliteSessionDriver {
  private db: any;
  private readonly dbPath: string;

  constructor(options: SqliteSessionDriverOptions = {}) {
    this.dbPath = options.dbPath ?? ':memory:';
    const DatabaseSync = getDatabaseSync();
    if (!DatabaseSync) {
      throw new Error('Native SQLite is not supported in this runtime environment (node:sqlite required).');
    }
    this.db = new DatabaseSync(this.dbPath);

    if (this.dbPath !== ':memory:' && options.enableWal !== false) {
      this.db.exec('PRAGMA journal_mode = WAL;');
    }
    this.db.exec('PRAGMA foreign_keys = ON;');

    this.initTables();
  }

  private initTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        active_branch TEXT NOT NULL,
        metadata TEXT,
        data TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS session_checkpoints (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        branch_name TEXT NOT NULL,
        label TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        route TEXT,
        state TEXT NOT NULL,
        events TEXT,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_sessions_updated ON sessions(updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_checkpoints_session ON session_checkpoints(session_id, timestamp ASC);
    `);
  }

  saveSession(dump: SessionDump, title?: string, metadata?: Record<string, any>): void {
    const serializedData = JSON.stringify(dump);
    const existing = this.loadSession(dump.sessionId);
    const now = Date.now();
    const effectiveTitle =
      title ?? (existing ? (existing as any).title : `Session ${dump.sessionId.slice(-6)}`);
    const metaStr = metadata ? JSON.stringify(metadata) : null;

    const stmt = this.db.prepare(`
      INSERT INTO sessions (id, title, created_at, updated_at, active_branch, metadata, data)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        updated_at = excluded.updated_at,
        active_branch = excluded.active_branch,
        metadata = COALESCE(excluded.metadata, sessions.metadata),
        data = excluded.data
    `);

    stmt.run(
      dump.sessionId,
      effectiveTitle,
      dump.exportedAt || now,
      now,
      dump.branches?.[0]?.name || 'main',
      metaStr,
      serializedData
    );

    if (Array.isArray(dump.branches)) {
      const insertCp = this.db.prepare(`
        INSERT OR REPLACE INTO session_checkpoints
        (id, session_id, branch_name, label, timestamp, route, state, events)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const branch of dump.branches) {
        if (Array.isArray(branch.checkpoints)) {
          for (const cp of branch.checkpoints) {
            insertCp.run(
              cp.id,
              dump.sessionId,
              branch.name,
              cp.label,
              cp.timestamp,
              cp.snapshot?.route || '/',
              JSON.stringify(cp.snapshot?.state || {}),
              JSON.stringify(cp.snapshot?.events || [])
            );
          }
        }
      }
    }
  }

  loadSession(sessionId: string): SessionDump | null {
    const stmt = this.db.prepare('SELECT data FROM sessions WHERE id = ?');
    const row = stmt.get(sessionId) as { data: string } | undefined;
    if (!row) return null;
    try {
      return JSON.parse(row.data) as SessionDump;
    } catch {
      return null;
    }
  }

  listSessions(): SqliteSessionRecord[] {
    const stmt = this.db.prepare(`
      SELECT 
        s.id,
        s.title,
        s.created_at as createdAt,
        s.updated_at as updatedAt,
        s.active_branch as activeBranch,
        s.metadata,
        LENGTH(s.data) as byteSize,
        (SELECT COUNT(*) FROM session_checkpoints c WHERE c.session_id = s.id) as checkpointCount
      FROM sessions s
      ORDER BY s.updated_at DESC
    `);

    const rows = stmt.all() as any[];
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      createdAt: Number(r.createdAt),
      updatedAt: Number(r.updatedAt),
      activeBranch: r.activeBranch,
      checkpointCount: Number(r.checkpointCount || 0),
      byteSize: Number(r.byteSize || 0),
      metadata: r.metadata ? JSON.parse(r.metadata) : undefined,
    }));
  }

  deleteSession(sessionId: string): boolean {
    const stmt = this.db.prepare('DELETE FROM sessions WHERE id = ?');
    const info = stmt.run(sessionId) as any;
    return (info?.changes ?? 0) > 0;
  }

  getCheckpoints(sessionId: string, branchName?: string): SessionCheckpoint[] {
    let query = 'SELECT * FROM session_checkpoints WHERE session_id = ?';
    const params: any[] = [sessionId];
    if (branchName) {
      query += ' AND branch_name = ?';
      params.push(branchName);
    }
    query += ' ORDER BY timestamp ASC';

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params) as any[];

    return rows.map((r) => ({
      id: r.id,
      label: r.label,
      timestamp: Number(r.timestamp),
      snapshot: {
        route: r.route || '/',
        state: r.state ? JSON.parse(r.state) : {},
        events: r.events ? JSON.parse(r.events) : [],
      },
    }));
  }

  searchSessions(term: string): SqliteSessionRecord[] {
    const stmt = this.db.prepare(`
      SELECT 
        s.id,
        s.title,
        s.created_at as createdAt,
        s.updated_at as updatedAt,
        s.active_branch as activeBranch,
        s.metadata,
        LENGTH(s.data) as byteSize,
        (SELECT COUNT(*) FROM session_checkpoints c WHERE c.session_id = s.id) as checkpointCount
      FROM sessions s
      WHERE s.title LIKE ? OR s.data LIKE ?
      ORDER BY s.updated_at DESC
    `);

    const pattern = `%${term}%`;
    const rows = stmt.all(pattern, pattern) as any[];
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      createdAt: Number(r.createdAt),
      updatedAt: Number(r.updatedAt),
      activeBranch: r.activeBranch,
      checkpointCount: Number(r.checkpointCount || 0),
      byteSize: Number(r.byteSize || 0),
      metadata: r.metadata ? JSON.parse(r.metadata) : undefined,
    }));
  }

  close(): void {
    if (this.db) {
      this.db.close();
    }
  }
}
