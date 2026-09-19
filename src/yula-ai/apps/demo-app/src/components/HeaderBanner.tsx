import React, { useRef } from 'react';
import type { TelemetrySummary, ContextUsage } from '@my-agent/core';

interface HeaderBannerProps {
  hitlEnabled: boolean;
  onToggleHitl: (enabled: boolean) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onNewConversation: () => void;
  onDumpSession: () => void;
  onRestoreSession: (e: React.ChangeEvent<HTMLInputElement>) => void;
  telemetrySummary: TelemetrySummary;
  contextUsage?: ContextUsage;
  autoCompactEnabled?: boolean;
  onToggleAutoCompact?: () => void;
  onManualCompact?: () => void;
  isCompacting?: boolean;
  // Pi Reference: Model & Provider Yönetimi
  selectedModel?: string;
  availableModels?: any[];
  onSelectModel?: (modelId: string) => void;
  onOpenLogin?: () => void;
  locale?: string;
  onToggleLocale?: () => void;
}

export function HeaderBanner({
  hitlEnabled,
  onToggleHitl,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onNewConversation,
  onDumpSession,
  onRestoreSession,
  telemetrySummary,
  contextUsage,
  autoCompactEnabled = true,
  onToggleAutoCompact,
  onManualCompact,
  isCompacting = false,
  selectedModel,
  availableModels = [],
  onSelectModel,
  onOpenLogin,
  locale = 'tr',
  onToggleLocale,
}: HeaderBannerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const percent = contextUsage?.percent ?? 0;
  const contextWindow = contextUsage?.contextWindow ?? 128000;
  const formattedWindow = `${Math.round(contextWindow / 1000)}k`;

  let contextColor = '#38bdf8';
  if (percent > 90) contextColor = '#ef4444';
  else if (percent > 70) contextColor = '#fbbf24';

  return (
    <div
      style={{
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
        color: '#ffffff',
        borderRadius: 16,
        padding: 24,
        marginBottom: 24,
        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, letterSpacing: '-0.025em', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span>⚡ Headless UI Agent Monorepo</span>
            <span style={{ fontSize: 12, fontWeight: 600, backgroundColor: '#2563eb', padding: '2px 8px', borderRadius: 20 }}>
              v2.0 (Pi Core)
            </span>
          </h1>
          <p style={{ margin: '6px 0 0', color: '#94a3b8', fontSize: 14 }}>
            React 19, DOM-Bağımsız Çift Yönlü İletişim Köprüsü, Pi Event Stream ve Zod Doğrulaması ile Güçlendirildi
          </p>
        </div>

        {/* Global Aksiyonlar ve Kontroller */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Pi Reference: Aktif Model ve Sağlayıcı Seçici */}
          {availableModels && availableModels.length > 0 && onSelectModel && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <select
                value={selectedModel || ''}
                onChange={(e) => onSelectModel(e.target.value)}
                style={{
                  backgroundColor: '#1e293b',
                  color: '#38bdf8',
                  border: '1px solid #334155',
                  borderRadius: 8,
                  padding: '6px 10px',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  outline: 'none',
                }}
                title="Aktif AI Modelini Değiştir (/model)"
              >
                {availableModels.map((m: any) => (
                  <option
                    key={m.id || m.modelId}
                    value={m.id || m.modelId}
                    style={{ backgroundColor: '#0f172a', color: '#f8fafc' }}
                  >
                    ⚡ {m.provider ? `${m.provider}/` : ''}{m.id || m.modelId}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Pi Reference: Login (OAuth/API Key) Butonu */}
          {onOpenLogin && (
            <button
              onClick={onOpenLogin}
              title="Sağlayıcıya Giriş Yap (/login)"
              style={{
                padding: '6px 12px',
                borderRadius: 8,
                border: '1px solid #d97706',
                background: 'rgba(217, 119, 6, 0.15)',
                color: '#fbbf24',
                fontWeight: 600,
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              🔑 Giriş (OAuth)
            </button>
          )}

          {/* i18n Dil Seçici Toggle */}
          {onToggleLocale && (
            <button
              onClick={onToggleLocale}
              title={locale === 'tr' ? 'Switch to English (en)' : "Türkçe'ye Geç (tr)"}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                backgroundColor: '#1e293b',
                color: '#f8fafc',
                border: '1px solid #334155',
                borderRadius: 8,
                padding: '6px 12px',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
            >
              <span>{locale === 'tr' ? '🇹🇷 TR' : '🇬🇧 EN'}</span>
            </button>
          )}

          {/* HITL / Güvenlik Modu Toggle */}
          <div
            onClick={() => onToggleHitl(!hitlEnabled)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              backgroundColor: hitlEnabled ? '#1e1b4b' : '#1e293b',
              border: `1px solid ${hitlEnabled ? '#6366f1' : '#334155'}`,
              borderRadius: 20,
              padding: '4px 12px',
              cursor: 'pointer',
              userSelect: 'none',
              transition: 'all 0.2s ease',
            }}
          >
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                backgroundColor: hitlEnabled ? '#818cf8' : '#64748b',
                boxShadow: hitlEnabled ? '0 0 8px #818cf8' : 'none',
              }}
            />
            <span style={{ fontSize: 12, fontWeight: 600, color: hitlEnabled ? '#e0e7ff' : '#94a3b8' }}>
              {hitlEnabled ? 'HITL Onay Modu Aktif' : 'Otonom Mod'}
            </span>
          </div>

          {/* Zaman Yolculuğu (Undo / Redo) */}
          <div style={{ display: 'flex', gap: 4, backgroundColor: '#1e293b', padding: '3px', borderRadius: 8, border: '1px solid #334155' }}>
            <button
              onClick={onUndo}
              disabled={!canUndo}
              title="Geri Al (Undo)"
              style={{
                background: 'none',
                border: 'none',
                color: canUndo ? '#f8fafc' : '#475569',
                cursor: canUndo ? 'pointer' : 'not-allowed',
                padding: '4px 8px',
                borderRadius: 6,
                fontSize: 14,
              }}
            >
              ↩️
            </button>
            <button
              onClick={onRedo}
              disabled={!canRedo}
              title="İleri Al (Redo)"
              style={{
                background: 'none',
                border: 'none',
                color: canRedo ? '#f8fafc' : '#475569',
                cursor: canRedo ? 'pointer' : 'not-allowed',
                padding: '4px 8px',
                borderRadius: 6,
                fontSize: 14,
              }}
            >
              ↪️
            </button>
          </div>

          {/* Oturum Dosya İşlemleri */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={onRestoreSession}
            style={{ display: 'none' }}
            accept=".json"
          />
          <button
            onClick={onNewConversation}
            title="Temiz Yeni Konuşma Başlat (/new)"
            style={{
              padding: '6px 10px',
              borderRadius: 8,
              border: '1px solid #475569',
              background: '#1e293b',
              color: '#f8fafc',
              fontWeight: 600,
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            🗑️ Yeni
          </button>
          <button
            onClick={onDumpSession}
            title="Oturumu JSON Olarak İndir"
            style={{
              padding: '6px 10px',
              borderRadius: 8,
              border: '1px solid #475569',
              background: '#1e293b',
              color: '#f8fafc',
              fontWeight: 600,
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            💾 Dump
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            title="JSON Dosyasından Geri Yükle"
            style={{
              padding: '6px 10px',
              borderRadius: 8,
              border: '1px solid #475569',
              background: '#1e293b',
              color: '#f8fafc',
              fontWeight: 600,
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            📂 Yükle
          </button>
        </div>
      </div>

      {/* Canlı Telemetri & Pi Context Doluluk Özet Şeridi */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginTop: 18, paddingTop: 16, borderTop: '1px solid #334155' }}>
        <div style={{ backgroundColor: '#1e293b', padding: '8px 12px', borderRadius: 8 }}>
          <div style={{ fontSize: 11, color: '#94a3b8' }}>Toplam Tur</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#38bdf8' }}>{telemetrySummary.totalTurns}</div>
        </div>

        <div style={{ backgroundColor: '#1e293b', padding: '8px 12px', borderRadius: 8 }}>
          <div style={{ fontSize: 11, color: '#94a3b8' }}>Ort. Yanıt Süresi</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#4ade80' }}>{telemetrySummary.averageTurnDurationMs} ms</div>
        </div>

        <div style={{ backgroundColor: '#1e293b', padding: '8px 12px', borderRadius: 8 }}>
          <div style={{ fontSize: 11, color: '#94a3b8' }}>Kümülatif Token</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#c084fc' }}>{telemetrySummary.totalTokens}</div>
        </div>

        <div style={{ backgroundColor: '#1e293b', padding: '8px 12px', borderRadius: 8 }}>
          <div style={{ fontSize: 11, color: '#94a3b8' }}>Tahmini Maliyet</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#fbbf24' }}>${telemetrySummary.totalEstimatedCostUsd}</div>
        </div>

        {/* Pi Reference: Canlı Context Doluluğu ve Auto-Compact Kartı */}
        <div
          style={{
            backgroundColor: '#1e293b',
            padding: '8px 12px',
            borderRadius: 8,
            border: `1px solid ${percent > 90 ? '#ef4444' : percent > 70 ? '#f59e0b' : '#334155'}`,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
            <span style={{ fontSize: 11, color: '#94a3b8' }}>Bağlam Doluluğu</span>
            {onToggleAutoCompact && (
              <span
                onClick={onToggleAutoCompact}
                style={{
                  fontSize: 10,
                  cursor: 'pointer',
                  fontWeight: 600,
                  color: autoCompactEnabled ? '#4ade80' : '#94a3b8',
                }}
                title="Otomatik özetleme (auto-compact) modunu aç/kapat"
              >
                {autoCompactEnabled ? '⚡ (auto)' : '⚪ man'}
              </span>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 4 }}>
            <span style={{ fontSize: 16, fontWeight: 700, color: contextColor }}>
              %{percent.toFixed(1)}
            </span>
            <span style={{ fontSize: 11, color: '#64748b' }}>
              / {formattedWindow}
            </span>
            {isCompacting && (
              <span style={{ fontSize: 10, color: '#f59e0b', marginLeft: 'auto', fontWeight: 600 }}>
                ⏳ Özet...
              </span>
            )}
            {!isCompacting && onManualCompact && percent > 20 && (
              <button
                onClick={onManualCompact}
                style={{
                  marginLeft: 'auto',
                  background: 'none',
                  border: 'none',
                  color: '#94a3b8',
                  fontSize: 11,
                  cursor: 'pointer',
                  padding: 0,
                }}
                title="Bağlamı şimdi özetle ve sıkıştır (/compact)"
              >
                🗜️
              </button>
            )}
          </div>

          {/* Mini Doluluk Çubuğu */}
          <div style={{ width: '100%', height: 4, backgroundColor: '#0f172a', borderRadius: 2, overflow: 'hidden' }}>
            <div
              style={{
                width: `${Math.min(100, percent)}%`,
                height: '100%',
                backgroundColor: contextColor,
                transition: 'width 0.3s ease',
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
