import React, { useState, useEffect } from 'react';
import {
  sessionManager,
  SessionCheckpoint,
  SessionBranch,
} from '@my-agent/core';

export interface SessionsTabProps {
  checkpoints?: SessionCheckpoint[];
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
}

export function SessionsTab({
  checkpoints: propCheckpoints,
  canUndo: propCanUndo,
  canRedo: propCanRedo,
  onUndo: propOnUndo,
  onRedo: propOnRedo,
}: SessionsTabProps) {
  const [activeBranch, setActiveBranch] = useState<SessionBranch>(sessionManager.getActiveBranch());
  const [allBranches, setAllBranches] = useState<SessionBranch[]>(sessionManager.getAllBranches());
  const [isForking, setIsForking] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');
  const [canUndoState, setCanUndoState] = useState(sessionManager.canUndo());
  const [canRedoState, setCanRedoState] = useState(sessionManager.canRedo());

  const syncState = () => {
    setActiveBranch({ ...sessionManager.getActiveBranch() });
    setAllBranches([...sessionManager.getAllBranches()]);
    setCanUndoState(sessionManager.canUndo());
    setCanRedoState(sessionManager.canRedo());
  };

  useEffect(() => {
    syncState();
    const unsub = sessionManager.subscribe(syncState);
    return () => unsub();
  }, []);

  const handleUndo = () => {
    if (propOnUndo) {
      propOnUndo();
    } else {
      sessionManager.undo();
    }
    syncState();
  };

  const handleRedo = () => {
    if (propOnRedo) {
      propOnRedo();
    } else {
      sessionManager.redo();
    }
    syncState();
  };

  const handleSwitchBranch = (name: string) => {
    sessionManager.switchBranch(name);
    syncState();
  };

  const handleCreateFork = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = newBranchName.trim();
    if (!trimmed) return;

    sessionManager.fork(trimmed);
    setNewBranchName('');
    setIsForking(false);
    syncState();
  };

  const ancestry = sessionManager.getBranchAncestry(activeBranch.name);
  const effectiveCheckpoints = activeBranch.checkpoints || propCheckpoints || [];
  const effectiveCanUndo = propCanUndo !== undefined ? propCanUndo : canUndoState;
  const effectiveCanRedo = propCanRedo !== undefined ? propCanRedo : canRedoState;

  return (
    <div style={{ flex: 1, padding: 14, overflowY: 'auto', backgroundColor: '#f8fafc', fontSize: 13 }}>
      {/* 1. Branching & Fork Header */}
      <div
        style={{
          backgroundColor: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: 8,
          padding: 10,
          marginBottom: 12,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 14 }}>🌿</span>
            <span style={{ fontWeight: 700, color: '#0f172a' }}>Dallar (Session Tree)</span>
          </div>
          <button
            onClick={() => setIsForking((prev) => !prev)}
            style={{
              padding: '3px 8px',
              backgroundColor: isForking ? '#e2e8f0' : '#eff6ff',
              color: isForking ? '#475569' : '#2563eb',
              border: '1px solid #bfdbfe',
              borderRadius: 6,
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {isForking ? '✕ İptal' : '➕ Yeni Dal Aç (Fork)'}
          </button>
        </div>

        {/* Fork Input Form */}
        {isForking && (
          <form
            onSubmit={handleCreateFork}
            style={{
              display: 'flex',
              gap: 6,
              marginTop: 8,
              marginBottom: 8,
              padding: 8,
              backgroundColor: '#f1f5f9',
              borderRadius: 6,
            }}
          >
            <input
              type="text"
              placeholder="Yeni dal adı (örn: senaryo-iskonto)"
              value={newBranchName}
              onChange={(e) => setNewBranchName(e.target.value)}
              style={{
                flex: 1,
                padding: '4px 8px',
                fontSize: 12,
                borderRadius: 4,
                border: '1px solid #cbd5e1',
                outline: 'none',
              }}
              autoFocus
            />
            <button
              type="submit"
              disabled={!newBranchName.trim()}
              style={{
                padding: '4px 10px',
                backgroundColor: newBranchName.trim() ? '#2563eb' : '#94a3b8',
                color: '#fff',
                border: 'none',
                borderRadius: 4,
                fontSize: 12,
                fontWeight: 600,
                cursor: newBranchName.trim() ? 'pointer' : 'not-allowed',
              }}
            >
              Çatalla
            </button>
          </form>
        )}

        {/* Branch Selector Pills */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
          {allBranches.map((b) => {
            const isActive = b.name === activeBranch.name;
            return (
              <button
                key={b.id}
                onClick={() => handleSwitchBranch(b.name)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '4px 9px',
                  borderRadius: 6,
                  border: `1px solid ${isActive ? '#2563eb' : '#cbd5e1'}`,
                  backgroundColor: isActive ? '#dbeafe' : '#f8fafc',
                  color: isActive ? '#1e40af' : '#475569',
                  fontSize: 11,
                  fontWeight: isActive ? 700 : 500,
                  cursor: 'pointer',
                }}
              >
                <span>{isActive ? '●' : '○'}</span>
                <span>{b.name}</span>
                <span style={{ fontSize: 10, color: isActive ? '#1d4ed8' : '#94a3b8' }}>
                  ({b.checkpoints.length})
                </span>
              </button>
            );
          })}
        </div>

        {/* Ancestry Lineage */}
        {ancestry.length > 1 && (
          <div style={{ marginTop: 8, fontSize: 11, color: '#64748b' }}>
            Soy Kütüğü: {ancestry.map((a) => a.name).join(' ➔ ')}
          </div>
        )}
      </div>

      {/* 2. Undo / Redo Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontWeight: 700, color: '#0f172a' }}>⏳ Zaman Yolculuğu</div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={handleUndo}
            disabled={!effectiveCanUndo}
            style={{
              padding: '4px 10px',
              background: effectiveCanUndo ? '#0f172a' : '#cbd5e1',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              fontSize: 12,
              cursor: effectiveCanUndo ? 'pointer' : 'not-allowed',
            }}
          >
            ↩ Geri Al (Undo)
          </button>
          <button
            onClick={handleRedo}
            disabled={!effectiveCanRedo}
            style={{
              padding: '4px 10px',
              background: effectiveCanRedo ? '#0f172a' : '#cbd5e1',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              fontSize: 12,
              cursor: effectiveCanRedo ? 'pointer' : 'not-allowed',
            }}
          >
            ↪ İleri Al (Redo)
          </button>
        </div>
      </div>

      {/* 3. Checkpoints List for Active Branch */}
      <div style={{ color: '#64748b', fontSize: 12, marginBottom: 8 }}>
        Aktif Dal: <strong>{activeBranch.name}</strong> ({effectiveCheckpoints.length} Adım):
      </div>

      {effectiveCheckpoints.length === 0 ? (
        <div style={{ color: '#94a3b8', textAlign: 'center', marginTop: 20 }}>
          Henüz bu dalda kaydedilmiş checkpoint bulunmuyor.<br />
          Sayfadaki durum değiştikçe otomatik snapshot alınır.
        </div>
      ) : (
        effectiveCheckpoints.map((cp, idx) => {
          const isCurrent = activeBranch.currentIndex === idx;
          return (
            <div
              key={cp.id}
              style={{
                backgroundColor: isCurrent ? '#f0fdf4' : '#ffffff',
                border: `1px solid ${isCurrent ? '#86efac' : '#e2e8f0'}`,
                borderRadius: 6,
                padding: 8,
                marginBottom: 6,
                fontSize: 12,
                transition: 'all 0.2s ease',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontWeight: 600, color: isCurrent ? '#166534' : '#0f172a' }}>
                  {isCurrent && '🟢 '}#{idx + 1} {cp.label}
                </div>
                {cp.snapshot?.route && (
                  <span
                    style={{
                      fontSize: 10,
                      padding: '1px 5px',
                      borderRadius: 3,
                      backgroundColor: '#f1f5f9',
                      color: '#475569',
                    }}
                  >
                    {cp.snapshot.route}
                  </span>
                )}
              </div>
              <div style={{ color: '#64748b', fontSize: 10, marginTop: 2 }}>
                {new Date(cp.timestamp).toLocaleTimeString()}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
