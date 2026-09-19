import React from 'react';
import { SessionCheckpoint } from '@my-agent/core';

interface SessionsTabProps {
  checkpoints: SessionCheckpoint[];
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}

export function SessionsTab({
  checkpoints,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: SessionsTabProps) {
  return (
    <div style={{ flex: 1, padding: 14, overflowY: 'auto', backgroundColor: '#f8fafc', fontSize: 13 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontWeight: 700, color: '#0f172a' }}>⏳ Zaman Yolculuğu (Undo / Redo)</div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={onUndo}
            disabled={!canUndo}
            style={{
              padding: '4px 10px',
              background: canUndo ? '#0f172a' : '#cbd5e1',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              fontSize: 12,
              cursor: canUndo ? 'pointer' : 'not-allowed',
            }}
          >
            ↩ Geri Al (Undo)
          </button>
          <button
            onClick={onRedo}
            disabled={!canRedo}
            style={{
              padding: '4px 10px',
              background: canRedo ? '#0f172a' : '#cbd5e1',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              fontSize: 12,
              cursor: canRedo ? 'pointer' : 'not-allowed',
            }}
          >
            ↪ İleri Al (Redo)
          </button>
        </div>
      </div>

      <div style={{ color: '#64748b', fontSize: 12, marginBottom: 10 }}>
        Kayıtlı Checkpoint'ler (Dallar):
      </div>
      {checkpoints.length === 0 ? (
        <div style={{ color: '#94a3b8', textAlign: 'center', marginTop: 20 }}>
          Henüz checkpoint kaydedilmedi.<br />
          Sayfadaki durum değiştikçe otomatik snapshot alınır.
        </div>
      ) : (
        checkpoints.map((cp, idx) => (
          <div
            key={cp.id}
            style={{
              backgroundColor: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: 6,
              padding: 8,
              marginBottom: 6,
              fontSize: 12,
            }}
          >
            <div style={{ fontWeight: 600, color: '#0f172a' }}>#{idx + 1} {cp.label}</div>
            <div style={{ color: '#64748b', fontSize: 10 }}>{new Date(cp.timestamp).toLocaleTimeString()}</div>
          </div>
        ))
      )}
    </div>
  );
}
