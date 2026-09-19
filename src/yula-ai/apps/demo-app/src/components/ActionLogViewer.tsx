import React from 'react';

export function ActionLogViewer({ logs, onClear }: { logs: string[]; onClear: () => void }) {
  return (
    <div
      style={{
        backgroundColor: '#ffffff',
        borderRadius: 16,
        padding: 18,
        border: '1px solid #e2e8f0',
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
        <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
          📜 Eylem ve Konsol Günlüğü
        </h3>
        <button
          onClick={onClear}
          style={{ background: 'none', border: 'none', color: '#64748b', fontSize: 11, cursor: 'pointer' }}
        >
          Temizle
        </button>
      </div>
      <div
        style={{
          backgroundColor: '#0f172a',
          color: '#38bdf8',
          fontFamily: 'monospace',
          fontSize: 11,
          borderRadius: 8,
          padding: 10,
          minHeight: 100,
          maxHeight: 140,
          overflowY: 'auto',
        }}
      >
        {logs.length === 0 ? (
          <span style={{ color: '#64748b' }}>Henüz log yok...</span>
        ) : (
          logs.map((l, i) => <div key={i} style={{ marginBottom: 4 }}>{l}</div>)
        )}
      </div>
    </div>
  );
}
