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
  onAutonomousLoop?: () => void;
  onUserChoice?: () => void;
  onStagnation?: () => void;
  onCompaction?: () => void;
  onForkClone?: () => void;
  onExportHtml?: () => void;
  onStreamingUpdate?: () => void;
  onSessionRetry?: () => void;
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
  onAutonomousLoop,
  onUserChoice,
  onStagnation,
  onCompaction,
  onForkClone,
  onExportHtml,
  onStreamingUpdate,
  onSessionRetry,
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#0f172a' }}>
          🤖 Otonom Ajan Döngüsü & Pi Güvenilirlik Test Paneli
        </h3>
        <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>23 Modüler Yetenek</span>
      </div>

      {/* 1. Kısım: Otonom Döngü, Ağaç Yönetimi ve Gelişmiş Pi Çekirdek Yetenekleri */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#4338ca', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          ⭐ Çekirdek Otonom Döngü & Ağaç Yönetimi (Core Agent Loop)
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <button
            onClick={onAutonomousLoop}
            style={btnStyle('#eef2ff', '#c7d2fe', '#3730a3')}
          >
            🚀 <strong>Otonom ReAct Döngüsü</strong> (3 Tur Kesintisiz)
          </button>

          <button
            onClick={onUserChoice}
            style={btnStyle('#fdf2f8', '#fbcfe8', '#9d174d')}
          >
            🃏 <strong>Inline HITL (ask_user_choice)</strong>
          </button>

          <button
            onClick={onForkClone}
            style={btnStyle('#ecfdf5', '#a7f3d0', '#065f46')}
          >
            🌳 <strong>Session Fork & Clone</strong> (Dallandırma)
          </button>

          <button
            onClick={onExportHtml}
            style={btnStyle('#eff6ff', '#bfdbfe', '#1e40af')}
          >
            📄 <strong>HTML Denetim Raporu (Export)</strong>
          </button>

          <button
            onClick={onStreamingUpdate}
            style={btnStyle('#f0fdf4', '#bbf7d0', '#166534')}
          >
            📡 <strong>Progressive Tool Streaming</strong> (Canlı İlerleme)
          </button>

          <button
            onClick={onSessionRetry}
            style={btnStyle('#f8fafc', '#cbd5e1', '#0f172a')}
          >
            🔁 <strong>Session Auto-Retry</strong> (Rate Limit Kurtarma)
          </button>

          <button
            onClick={onStagnation}
            style={btnStyle('#fff1f2', '#fecdd3', '#9f1239')}
          >
            🛑 <strong>Kısırdöngü Sezici (Stagnation)</strong>
          </button>

          <button
            onClick={onCompaction}
            style={btnStyle('#f0fdf4', '#bbf7d0', '#166534')}
          >
            🧹 <strong>Context Compaction (Özetleme)</strong>
          </button>
        </div>
      </div>

      {/* 2. Kısım: 15 Standart Pi Yeteneği */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          ⚙️ Standart Pi Güvenilirlik Yetenekleri
        </div>
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
            style={btnStyle('#fffbeb', '#fde68a', '#b45309')}
          >
            🎟️ <strong>Plugin VIP Senaryosu</strong> (Hook + Guard)
          </button>
        </div>
      </div>
    </div>
  );
}
