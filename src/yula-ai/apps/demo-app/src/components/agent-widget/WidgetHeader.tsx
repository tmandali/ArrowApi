import React, { useRef } from 'react';
import type { ContextUsage } from '@my-agent/core';

export type WidgetTab = 'chat' | 'pi-events' | 'skills' | 'memory' | 'steering' | 'sessions' | 'metrics';

interface WidgetHeaderProps {
  activeTab: WidgetTab;
  onSelectTab: (tab: WidgetTab) => void;
  onClose: () => void;
  onNewConversation: () => void;
  onDumpSession: () => void;
  onRestoreSession: (json: string) => void;
  piEventsCount: number;
  skillsCount: number;
  memoryCount: number;
  contextUsage?: ContextUsage;
  autoCompactEnabled?: boolean;
  onToggleAutoCompact?: () => void;
  onManualCompact?: () => void;
  isCompacting?: boolean;
  // Pi Reference: Model & Provider Yönetimi
  selectedModel?: string;
  selectedProvider?: string;
  availableModels?: any[];
  onSelectModel?: (modelId: string, provider?: string) => void;
  onOpenLogin?: () => void;
  onExportHtmlReport?: () => void;
  harnessHealth?: { status: 'healthy' | 'degraded'; activeBranch: string };
}

export function WidgetHeader({
  activeTab,
  onSelectTab,
  onClose,
  onNewConversation,
  onDumpSession,
  onRestoreSession,
  piEventsCount,
  skillsCount,
  memoryCount,
  contextUsage,
  autoCompactEnabled = true,
  onToggleAutoCompact,
  onManualCompact,
  isCompacting = false,
  selectedModel,
  selectedProvider,
  availableModels = [],
  onSelectModel,
  onOpenLogin,
  onExportHtmlReport,
  harnessHealth,
}: WidgetHeaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const tabBtnStyle = (tab: WidgetTab): React.CSSProperties => ({
    padding: '3px 8px',
    borderRadius: 6,
    fontSize: 11,
    fontWeight: 600,
    border: 'none',
    cursor: 'pointer',
    background: activeTab === tab ? '#2563eb' : '#1e293b',
    color: activeTab === tab ? '#ffffff' : '#94a3b8',
  });

  const actionBtnStyle: React.CSSProperties = {
    background: '#334155',
    border: 'none',
    borderRadius: 4,
    color: '#f8fafc',
    fontSize: 11,
    padding: '3px 6px',
    cursor: 'pointer',
    fontWeight: 600,
  };

  // Pi Reference: Context Doluluk Rengi
  const percent = contextUsage?.percent ?? 0;
  const contextWindow = contextUsage?.contextWindow ?? 128000;
  const formattedWindow = `${Math.round(contextWindow / 1000)}k`;

  let badgeColor = '#38bdf8'; // normal (< 70%)
  let badgeBg = 'rgba(56, 189, 248, 0.1)';
  if (percent > 90) {
    badgeColor = '#ef4444'; // critical (> 90%)
    badgeBg = 'rgba(239, 68, 68, 0.15)';
  } else if (percent > 70) {
    badgeColor = '#fbbf24'; // warning (70-90%)
    badgeBg = 'rgba(251, 191, 36, 0.15)';
  }

  return (
    <div
      style={{
        padding: '10px 14px',
        borderBottom: '1px solid #1e293b',
        backgroundColor: '#0f172a',
        color: '#f8fafc',
      }}
    >
      {/* Üst Bar: Başlık ve Oturum Butonları */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 16 }}>🤖</span>
          <span style={{ fontWeight: 700, fontSize: 14 }}>Headless UI Agent</span>
          {harnessHealth && (
            <span
              title={`Harness Durumu: ${harnessHealth.status}, Aktif Dal: ${harnessHealth.activeBranch}`}
              style={{
                fontSize: 10,
                padding: '1px 6px',
                borderRadius: 10,
                fontWeight: 600,
                backgroundColor: harnessHealth.status === 'healthy' ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                color: harnessHealth.status === 'healthy' ? '#4ade80' : '#f87171',
                border: `1px solid ${harnessHealth.status === 'healthy' ? '#22c55e' : '#ef4444'}`,
              }}
            >
              {harnessHealth.status === 'healthy' ? '🟢 Sağlıklı' : '🔴 Sorunlu'}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input
            type="file"
            ref={fileInputRef}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const reader = new FileReader();
              reader.onload = (ev) => {
                const text = ev.target?.result as string;
                onRestoreSession(text);
              };
              reader.readAsText(file);
              e.target.value = '';
            }}
            style={{ display: 'none' }}
            accept=".json"
          />
          <button
            onClick={onNewConversation}
            title="Temiz Yeni Konuşma Başlat (/new)"
            style={actionBtnStyle}
          >
            🗑️ Yeni
          </button>
          <button
            onClick={onDumpSession}
            title="Oturumu JSON Olarak İndir"
            style={actionBtnStyle}
          >
            💾 Dump
          </button>
          {onExportHtmlReport && (
            <button
              onClick={onExportHtmlReport}
              title="HTML Denetim Raporu İndir"
              style={actionBtnStyle}
            >
              📊 Rapor
            </button>
          )}
          <button
            onClick={() => fileInputRef.current?.click()}
            title="JSON Dump Dosyası Geri Yükle"
            style={actionBtnStyle}
          >
            📂 Yükle
          </button>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#94a3b8',
              fontSize: 16,
              cursor: 'pointer',
              marginLeft: 4,
            }}
          >
            ✕
          </button>
        </div>
      </div>

      {/* Model Seçici ve Canlı Context Rozeti Barı */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: '#131e32',
          padding: '5px 8px',
          borderRadius: 6,
          marginBottom: 8,
          fontSize: 11,
          border: '1px solid #1e293b',
          gap: 6,
          flexWrap: 'wrap',
        }}
      >
        {/* Sol: Model Seçici & Giriş */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {availableModels && availableModels.length > 0 && onSelectModel ? (
            <select
              value={selectedModel || ''}
              onChange={(e) => onSelectModel(e.target.value)}
              style={{
                backgroundColor: '#1e293b',
                color: '#38bdf8',
                border: '1px solid #334155',
                borderRadius: 4,
                padding: '2px 6px',
                fontSize: 11,
                fontWeight: 600,
                outline: 'none',
                cursor: 'pointer',
                maxWidth: 160,
              }}
              title="Aktif AI Modelini ve Sağlayıcısını Değiştir (/model)"
            >
              {availableModels.map((m: any) => (
                <option
                  key={m.id || m.modelId}
                  value={m.id || m.modelId}
                  style={{ backgroundColor: '#0f172a', color: '#f8fafc' }}
                >
                  {m.provider ? `${m.provider}/` : ''}{m.id || m.modelId}
                </option>
              ))}
            </select>
          ) : (
            <span style={{ fontSize: 11, color: '#38bdf8', fontWeight: 600 }}>
              {selectedProvider ? `${selectedProvider}/` : ''}{selectedModel || 'gpt-4o-mini'}
            </span>
          )}

          {onOpenLogin && (
            <button
              onClick={onOpenLogin}
              title="OAuth veya API Key ile Giriş Yap (/login)"
              style={{
                background: '#1e293b',
                border: '1px solid #334155',
                borderRadius: 4,
                color: '#fbbf24',
                fontSize: 10,
                padding: '2px 5px',
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              🔑 Giriş
            </button>
          )}
        </div>

        {/* Sağ: Context Doluluk & Auto-Compact */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span
            style={{
              color: badgeColor,
              backgroundColor: badgeBg,
              padding: '1px 6px',
              borderRadius: 4,
              fontWeight: 700,
            }}
            title={`Kullanılan: ${contextUsage?.tokens ?? 0} token / Pencere: ${contextWindow}`}
          >
            {percent.toFixed(1)}% / {formattedWindow}
          </span>
          <button
            onClick={onToggleAutoCompact}
            style={{
              background: autoCompactEnabled ? 'rgba(34, 197, 94, 0.15)' : 'rgba(148, 163, 184, 0.15)',
              color: autoCompactEnabled ? '#4ade80' : '#94a3b8',
              border: 'none',
              borderRadius: 4,
              padding: '1px 5px',
              fontSize: 10,
              fontWeight: 600,
              cursor: 'pointer',
            }}
            title="Otomatik bağlam özetlemeyi (auto-compact) aç/kapat"
          >
            {autoCompactEnabled ? '⚡ auto' : '⚪ man'}
          </button>

          {isCompacting ? (
            <span style={{ color: '#f59e0b', fontWeight: 600, fontSize: 10 }}>⏳ Özet...</span>
          ) : (
            onManualCompact && (
              <button
                onClick={onManualCompact}
                style={{
                  background: '#1e293b',
                  color: '#94a3b8',
                  border: '1px solid #334155',
                  borderRadius: 4,
                  padding: '1px 5px',
                  fontSize: 10,
                  cursor: 'pointer',
                }}
                title="Şimdi bağlamı özetle (/compact)"
              >
                🗜️
              </button>
            )
          )}
        </div>
      </div>

      {/* Tab Bar */}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        <button onClick={() => onSelectTab('chat')} style={tabBtnStyle('chat')}>
          💬 Sohbet
        </button>
        <button onClick={() => onSelectTab('pi-events')} style={tabBtnStyle('pi-events')}>
          🌲 Olay Akışı ({piEventsCount})
        </button>
        <button onClick={() => onSelectTab('skills')} style={tabBtnStyle('skills')}>
          🎯 Beceriler ({skillsCount})
        </button>
        <button onClick={() => onSelectTab('memory')} style={tabBtnStyle('memory')}>
          🧠 Hafıza ({memoryCount})
        </button>
        <button onClick={() => onSelectTab('steering')} style={tabBtnStyle('steering')}>
          ⚡ Steer & Takip
        </button>
        <button onClick={() => onSelectTab('sessions')} style={tabBtnStyle('sessions')}>
          ⏳ Zaman
        </button>
        <button onClick={() => onSelectTab('metrics')} style={tabBtnStyle('metrics')}>
          📊 Metrikler
        </button>
      </div>
    </div>
  );
}
