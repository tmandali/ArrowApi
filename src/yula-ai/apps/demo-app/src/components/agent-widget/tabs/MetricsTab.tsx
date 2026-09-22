import React from 'react';
import { type TelemetrySummary, type ContextUsage, promptCacheTracker } from '@my-agent/core';

export function MetricsTab({
  summary,
  contextUsage,
}: {
  summary: TelemetrySummary;
  contextUsage?: ContextUsage;
}) {
  const percent = contextUsage?.percent ?? 0;
  const contextWindow = contextUsage?.contextWindow ?? 128000;
  const tokens = contextUsage?.tokens ?? 0;
  const cacheMetrics = promptCacheTracker.getMetrics();

  let barColor = '#38bdf8';
  if (percent > 90) barColor = '#ef4444';
  else if (percent > 70) barColor = '#fbbf24';

  return (
    <div style={{ flex: 1, padding: 14, overflowY: 'auto', backgroundColor: '#f8fafc', fontSize: 13 }}>
      <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: 12 }}>
        📊 Pi Structured Telemetry & Maliyet Raporu
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
        <div style={{ background: '#eff6ff', padding: 10, borderRadius: 8, border: '1px solid #bfdbfe' }}>
          <div style={{ color: '#1e40af', fontSize: 11, fontWeight: 600 }}>Toplam Tur (Turns)</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#1e3a8a' }}>{summary.totalTurns}</div>
        </div>
        <div style={{ background: '#f0fdf4', padding: 10, borderRadius: 8, border: '1px solid #bbf7d0' }}>
          <div style={{ color: '#166534', fontSize: 11, fontWeight: 600 }}>Ortalama Tur Süresi</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#14532d' }}>{summary.averageTurnDurationMs} ms</div>
        </div>
        <div style={{ background: '#faf5ff', padding: 10, borderRadius: 8, border: '1px solid #e9d5ff' }}>
          <div style={{ color: '#6b21a8', fontSize: 11, fontWeight: 600 }}>Kümülatif Token</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#581c87' }}>{summary.totalTokens}</div>
        </div>
        <div style={{ background: '#fffbeb', padding: 10, borderRadius: 8, border: '1px solid #fde68a' }}>
          <div style={{ color: '#854d0e', fontSize: 11, fontWeight: 600 }}>Tahmini Maliyet</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#713f12' }}>${summary.totalEstimatedCostUsd}</div>
        </div>
      </div>

      {/* Pi Reference: Aktif Context Window & Doluluk Paneli */}
      <div
        style={{
          background: '#ffffff',
          padding: 14,
          borderRadius: 8,
          border: '1px solid #e2e8f0',
          boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.05)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div style={{ fontWeight: 600, color: '#334155' }}>Aktif Bağlam (Context Window) Doluluğu</div>
          <div style={{ fontWeight: 700, color: barColor, fontSize: 14 }}>
            %{percent.toFixed(1)}
          </div>
        </div>

        {/* Progress Bar */}
        <div
          style={{
            width: '100%',
            height: 8,
            backgroundColor: '#e2e8f0',
            borderRadius: 4,
            overflow: 'hidden',
            marginBottom: 8,
          }}
        >
          <div
            style={{
              width: `${Math.min(100, percent)}%`,
              height: '100%',
              backgroundColor: barColor,
              borderRadius: 4,
              transition: 'width 0.3s ease',
            }}
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#64748b' }}>
          <span>Kullanılan: {tokens.toLocaleString()} token</span>
          <span>Kapasite: {contextWindow.toLocaleString()} token</span>
        </div>

        <div style={{ marginTop: 8, fontSize: 10, color: '#94a3b8', borderTop: '1px dashed #e2e8f0', paddingTop: 6 }}>
          ⚡ Otomatik Compaction (Auto-Compact): Bağlam %87 eşiğini (16.4k rezerv tamponu) aştığında eski mesajlar otomatik özetlenir.
        </div>
      </div>

      {/* Prompt Caching & Maliyet Tasarrufu Paneli (Pi Reference) */}
      <div
        style={{
          marginTop: 12,
          background: '#ffffff',
          padding: 12,
          borderRadius: 8,
          border: '1px solid #e2e8f0',
          boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.05)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <strong style={{ color: '#0f172a', fontSize: 12 }}>⚡ Prompt Cache Tasarruf & TTL Takibi</strong>
          <span
            style={{
              fontSize: 10,
              padding: '2px 6px',
              borderRadius: 4,
              fontWeight: 600,
              backgroundColor: cacheMetrics.isCacheWarm ? '#dcfce7' : '#f1f5f9',
              color: cacheMetrics.isCacheWarm ? '#166534' : '#64748b',
            }}
          >
            {cacheMetrics.isCacheWarm ? '🟢 Cache Sıcak (TTL Aktif)' : '⚪ Beklemede (5dk TTL)'}
          </span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, fontSize: 11 }}>
          <div style={{ backgroundColor: '#f8fafc', padding: 6, borderRadius: 4, border: '1px solid #e2e8f0' }}>
            <div style={{ color: '#64748b', fontSize: 10 }}>İsabet Oranı</div>
            <div style={{ fontWeight: 700, color: '#0284c7' }}>%{cacheMetrics.cacheHitRatio}</div>
          </div>
          <div style={{ backgroundColor: '#f8fafc', padding: 6, borderRadius: 4, border: '1px solid #e2e8f0' }}>
            <div style={{ color: '#64748b', fontSize: 10 }}>Önbellekten Okunan</div>
            <div style={{ fontWeight: 700, color: '#16a34a' }}>{cacheMetrics.totalCacheReadTokens.toLocaleString()} tkn</div>
          </div>
          <div style={{ backgroundColor: '#f8fafc', padding: 6, borderRadius: 4, border: '1px solid #e2e8f0' }}>
            <div style={{ color: '#64748b', fontSize: 10 }}>Bütçe Tasarrufu</div>
            <div style={{ fontWeight: 700, color: '#15803d' }}>+${cacheMetrics.estimatedSavingsUsd}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
