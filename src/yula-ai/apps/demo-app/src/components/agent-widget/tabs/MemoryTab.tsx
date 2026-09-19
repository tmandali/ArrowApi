import React, { useState } from 'react';
import { MemoryEntry } from '@my-agent/core';

interface MemoryTabProps {
  memories: MemoryEntry[];
  onRemember: (key: string, value: any, scope?: 'session' | 'persistent', description?: string) => void;
  onForget: (key: string) => void;
  onRefresh: () => void;
}

export function MemoryTab({ memories, onRemember, onForget, onRefresh }: MemoryTabProps) {
  const [newKey, setNewKey] = useState('');
  const [newVal, setNewVal] = useState('');

  const handleAdd = () => {
    if (newKey.trim() && newVal.trim()) {
      onRemember(newKey.trim(), newVal.trim(), 'persistent', 'Kullanıcı tarafından eklendi');
      onRefresh();
      setNewKey('');
      setNewVal('');
    }
  };

  return (
    <div style={{ flex: 1, padding: 14, overflowY: 'auto', backgroundColor: '#f8fafc', fontSize: 13 }}>
      <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: 6 }}>
        🧠 Pi Agent Hafıza Katmanı (Memory)
      </div>
      <p style={{ color: '#64748b', fontSize: 12, margin: '0 0 10px' }}>
        Agent'ın konuşma boyunca ve oturumlar arasında aklında tuttuğu gerçekler & tercihler:
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
        {memories.length === 0 ? (
          <div style={{ color: '#94a3b8', textAlign: 'center', padding: '16px 0' }}>Hafıza boş.</div>
        ) : (
          memories.map((m) => (
            <div
              key={m.key}
              style={{
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: 6,
                padding: 8,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontWeight: 600, color: '#0f172a' }}>{m.key}:</span>
                  <span style={{ color: '#2563eb', fontWeight: 500 }}>{JSON.stringify(m.value)}</span>
                  <span
                    style={{
                      fontSize: 9,
                      padding: '1px 5px',
                      borderRadius: 4,
                      background: m.scope === 'persistent' ? '#fef3c7' : '#e0e7ff',
                      color: m.scope === 'persistent' ? '#92400e' : '#3730a3',
                      fontWeight: 600,
                    }}
                  >
                    {m.scope === 'persistent' ? 'Kalıcı' : 'Oturum'}
                  </span>
                </div>
                {m.description && <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{m.description}</div>}
              </div>
              <button
                onClick={() => {
                  onForget(m.key);
                  onRefresh();
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#ef4444',
                  cursor: 'pointer',
                  fontSize: 14,
                }}
                title="Unut (Sil)"
              >
                ✕
              </button>
            </div>
          ))
        )}
      </div>

      <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 12 }}>
        <div style={{ fontWeight: 600, color: '#0f172a', marginBottom: 6, fontSize: 12 }}>
          ➕ Hafızaya Yeni Bilgi Ekle:
        </div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
          <input
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            placeholder="Anahtar (örn: preferred_store)"
            style={{ flex: 1, padding: '6px 8px', borderRadius: 4, border: '1px solid #cbd5e1', fontSize: 11 }}
          />
          <input
            value={newVal}
            onChange={(e) => setNewVal(e.target.value)}
            placeholder="Değer (örn: Beşiktaş)"
            style={{ flex: 1, padding: '6px 8px', borderRadius: 4, border: '1px solid #cbd5e1', fontSize: 11 }}
          />
        </div>
        <button
          onClick={handleAdd}
          style={{
            width: '100%',
            padding: '6px 12px',
            backgroundColor: '#0f172a',
            color: '#ffffff',
            border: 'none',
            borderRadius: 6,
            fontSize: 11,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Hafızaya Kaydet
        </button>
      </div>
    </div>
  );
}
