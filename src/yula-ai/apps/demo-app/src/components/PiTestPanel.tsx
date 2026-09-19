import React from 'react';

interface PiTestPanelProps {
  hitlEnabled: boolean;
  onSetFields: () => void;
  onSubmit: () => void;
  onSteer: () => void;
  onFollowUp: () => void;
  onTruncate: () => void;
  onMutationLine: () => void;
  onAdaptivePublisher: () => void;
  onRetry: () => void;
  onMemory: () => void;
  onPlugin: () => void;
  onLanes: () => void;
  onDeferred: () => void;
  onReconcile: () => void;
  onRpc: () => void;
  onVipCoupon: () => void;
}

export function PiTestPanel({
  hitlEnabled,
  onSetFields,
  onSubmit,
  onSteer,
  onFollowUp,
  onTruncate,
  onMutationLine,
  onAdaptivePublisher,
  onRetry,
  onMemory,
  onPlugin,
  onLanes,
  onDeferred,
  onReconcile,
  onRpc,
  onVipCoupon,
}: PiTestPanelProps) {
  const btnStyle = (bg: string, border: string, color: string): React.CSSProperties => ({
    textAlign: 'left',
    padding: '8px 10px',
    backgroundColor: bg,
    border: `1px solid ${border}`,
    color,
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: 12,
  });

  return (
    <div style={{ marginTop: 24, paddingTop: 18, borderTop: '1px solid #e2e8f0' }}>
      <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700, color: '#0f172a' }}>
        ⚡ Pi Mimarisi Test Paneli (Genişletilmiş Standart Set)
      </h3>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <button
          onClick={onSetFields}
          style={btnStyle('#f8fafc', '#cbd5e1', '#0f172a')}
        >
          ✍️ <strong>SET_FIELDS</strong> (Kadıköy/2026-09)
        </button>

        <button
          onClick={onSubmit}
          style={btnStyle('#f8fafc', '#cbd5e1', '#0f172a')}
        >
          🚀 <strong>SUBMIT</strong> {hitlEnabled && '(HITL Onayı İster)'}
        </button>

        <button
          onClick={onSteer}
          style={btnStyle('#fdf2f8', '#fbcfe8', '#9d174d')}
        >
          ⚡ <strong>Steer (Araya Gir)</strong>
        </button>

        <button
          onClick={onFollowUp}
          style={btnStyle('#f5f3ff', '#ddd6fe', '#5b21b6')}
        >
          📥 <strong>Follow-up (Takip İşi)</strong>
        </button>

        <button
          onClick={onTruncate}
          style={btnStyle('#fef3c7', '#fde68a', '#92400e')}
        >
          ✂️ <strong>Dual-Bound Truncation</strong>
        </button>

        <button
          onClick={onMutationLine}
          style={btnStyle('#ecfdf5', '#a7f3d0', '#065f46')}
        >
          ⛓️ <strong>Mutation Line (Atomik)</strong>
        </button>

        <button
          onClick={onAdaptivePublisher}
          style={btnStyle('#e0f2fe', '#bae6fd', '#0369a1')}
        >
          🌊 <strong>Adaptive Publisher (60fps)</strong>
        </button>

        <button
          onClick={onRetry}
          style={btnStyle('#f1f5f9', '#cbd5e1', '#334155')}
        >
          🔁 <strong>Retry (Backoff ile)</strong>
        </button>

        <button
          onClick={onMemory}
          style={btnStyle('#fdf4ff', '#f5d0fe', '#86198f')}
        >
          🧠 <strong>Memory (Kalıcı Tercih)</strong>
        </button>

        <button
          onClick={onPlugin}
          style={btnStyle('#eff6ff', '#bfdbfe', '#1e40af')}
        >
          🔌 <strong>Plugin (Tahminleme Modülü)</strong>
        </button>

        <button
          onClick={onLanes}
          style={btnStyle('#faf5ff', '#e9d5ff', '#6b21a8')}
        >
          🛤️ <strong>Multi-Lane (Sohbet + Arka Plan)</strong>
        </button>

        <button
          onClick={onDeferred}
          style={btnStyle('#fff7ed', '#fed7aa', '#9a3412')}
        >
          ⏱️ <strong>Deferred (Askıya Al & Uyandır)</strong>
        </button>

        <button
          onClick={onReconcile}
          style={btnStyle('#fef2f2', '#fecaca', '#991b1b')}
        >
          🔄 <strong>Reconcile (Kilitlenme Kurtarma)</strong>
        </button>

        <button
          onClick={onRpc}
          style={btnStyle('#f0fdf4', '#bbf7d0', '#166534')}
        >
          🌐 <strong>Remote RPC (JSON-RPC 2.0)</strong>
        </button>

        <button
          onClick={onVipCoupon}
          style={btnStyle('#fefce8', '#fde68a', '#854d0e')}
        >
          🎟️ <strong>VIP Kupon (Custom Plugin E2E)</strong>
        </button>
      </div>
    </div>
  );
}
