import React, { useState, useEffect } from 'react';

interface OAuthProviderItem {
  id: string;
  name: string;
  isSubscription?: boolean;
}

interface OAuthLoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function OAuthLoginModal({ isOpen, onClose, onSuccess }: OAuthLoginModalProps) {
  const [providers, setProviders] = useState<OAuthProviderItem[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<string>('openrouter');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Flow states
  const [authUrlInfo, setAuthUrlInfo] = useState<{ url: string; instructions?: string; verifier?: string } | null>(null);
  const [deviceInfo, setDeviceInfo] = useState<{ userCode: string; verificationUri: string; deviceCode: string } | null>(null);
  const [manualCodeInput, setManualCodeInput] = useState<string>('');
  const [isPolling, setIsPolling] = useState<boolean>(false);

  useEffect(() => {
    if (!isOpen) {
      resetState();
      return;
    }
    fetch('/api/auth/oauth/providers')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setProviders(data);
      })
      .catch((err) => console.error('OAuth sağlayıcıları alınamadı:', err));
  }, [isOpen]);

  const resetState = () => {
    setLoading(false);
    setError(null);
    setSuccessMsg(null);
    setAuthUrlInfo(null);
    setDeviceInfo(null);
    setManualCodeInput('');
    setIsPolling(false);
  };

  const handleStart = async () => {
    setLoading(true);
    setError(null);
    setSuccessMsg(null);
    setAuthUrlInfo(null);
    setDeviceInfo(null);

    try {
      const res = await fetch('/api/auth/oauth/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: selectedProvider }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Giriş başlatılamadı');

      if (data.type === 'auth_url') {
        setAuthUrlInfo(data.info);
        // Otomatik yeni pencerede aç
        window.open(data.info.url, '_blank');
      } else if (data.type === 'device_code') {
        setDeviceInfo(data.info);
        pollDeviceFlow(selectedProvider, data.info);
      }
    } catch (err: any) {
      setError(err.message || 'OAuth hatası');
    } finally {
      setLoading(false);
    }
  };

  const pollDeviceFlow = async (provider: string, info: any) => {
    setIsPolling(true);
    try {
      const res = await fetch('/api/auth/oauth/poll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, info }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Cihaz akışı başarısız oldu');

      setSuccessMsg(`Tebrikler! ${provider} ile OAuth girişi başarıyla tamamlandı.`);
      setIsPolling(false);
      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Cihaz akışında hata oluştu');
      setIsPolling(false);
    }
  };

  const handleExchange = async () => {
    if (!manualCodeInput.trim() || !authUrlInfo?.verifier) {
      setError('Lütfen yetkilendirme linkini veya kodunu yapıştırın.');
      return;
    }
    setLoading(true);
    setError(null);

    try {
      // Girilen string bir URL ise kod parametresini ayıkla
      let code = manualCodeInput.trim();
      try {
        const urlObj = new URL(code);
        code = urlObj.searchParams.get('code') || code;
      } catch {
        // Doğrudan kod formatında
      }

      const res = await fetch('/api/auth/oauth/exchange', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: selectedProvider,
          code,
          verifier: authUrlInfo.verifier,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Kod takası başarısız');

      setSuccessMsg(`Başarılı! ${selectedProvider} anahtarı auth.json dosyasına kaydedildi.`);
      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Kod takası başarısız oldu');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(4px)',
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'Inter, system-ui, sans-serif',
      }}
    >
      <div
        style={{
          backgroundColor: '#1e293b',
          border: '1px solid #334155',
          borderRadius: 12,
          padding: 24,
          width: 480,
          maxWidth: '90vw',
          color: '#f8fafc',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#38bdf8' }}>
            🔐 Pi OAuth ile Giriş Yap
          </h3>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              fontSize: 18,
              cursor: 'pointer',
            }}
          >
            ✕
          </button>
        </div>

        <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 16 }}>
          Pi mimarisi destekli PKCE ve Device Flow ile API anahtarlarınızı güvenle bağlayın.
        </div>

        {/* Sağlayıcı Seçici */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#cbd5e1', marginBottom: 6 }}>
            OAuth Sağlayıcısı Seçin:
          </label>
          <select
            value={selectedProvider}
            onChange={(e) => {
              setSelectedProvider(e.target.value);
              resetState();
            }}
            disabled={loading || isPolling}
            style={{
              width: '100%',
              backgroundColor: '#0f172a',
              border: '1px solid #475569',
              borderRadius: 6,
              color: '#f8fafc',
              padding: '8px 12px',
              fontSize: 13,
            }}
          >
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} {p.isSubscription ? '(Abonelikli)' : ''}
              </option>
            ))}
          </select>
        </div>

        {/* Hata ve Başarı Mesajları */}
        {error && (
          <div style={{ backgroundColor: '#7f1d1d', border: '1px solid #dc2626', color: '#fecaca', padding: 10, borderRadius: 6, fontSize: 12, marginBottom: 14 }}>
            ⚠️ {error}
          </div>
        )}
        {successMsg && (
          <div style={{ backgroundColor: '#064e3b', border: '1px solid #059669', color: '#a7f3d0', padding: 10, borderRadius: 6, fontSize: 12, marginBottom: 14 }}>
            ✅ {successMsg}
          </div>
        )}

        {/* Cihaz Kodu Akışı (Device Code Flow - GitHub Copilot) */}
        {deviceInfo && (
          <div style={{ backgroundColor: '#0f172a', border: '1px solid #38bdf8', padding: 16, borderRadius: 8, marginBottom: 16, textAlign: 'center' }}>
            <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 8 }}>GitHub cihaz doğrulama kodunuz:</div>
            <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: 4, color: '#38bdf8', fontFamily: 'monospace', margin: '8px 0' }}>
              {deviceInfo.userCode}
            </div>
            <a
              href={deviceInfo.verificationUri}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-block',
                marginTop: 8,
                backgroundColor: '#2563eb',
                color: '#fff',
                padding: '6px 14px',
                borderRadius: 6,
                textDecoration: 'none',
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              GitHub'da Kodu Onayla ↗
            </a>
            {isPolling && (
              <div style={{ marginTop: 12, fontSize: 11, color: '#38bdf8' }}>
                ⏳ GitHub onayı bekleniyor, sayfa otomatik güncellenecek...
              </div>
            )}
          </div>
        )}

        {/* URL / PKCE Takas Akışı (OpenRouter / Anthropic) */}
        {authUrlInfo && (
          <div style={{ backgroundColor: '#0f172a', border: '1px solid #475569', padding: 14, borderRadius: 8, marginBottom: 16 }}>
            <div style={{ fontSize: 12, color: '#cbd5e1', marginBottom: 6 }}>
              {authUrlInfo.instructions || 'Açılan pencerede yetki verip yönlendirme linkini buraya yapıştırın:'}
            </div>
            <a
              href={authUrlInfo.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: 'inline-block', color: '#38bdf8', fontSize: 12, textDecoration: 'underline', marginBottom: 10 }}
            >
              Yetkilendirme Sayfasını Yeniden Aç ↗
            </a>
            <input
              type="text"
              placeholder="Yönlendirme linkini veya code=... değerini yapıştırın"
              value={manualCodeInput}
              onChange={(e) => setManualCodeInput(e.target.value)}
              style={{
                width: '100%',
                backgroundColor: '#1e293b',
                border: '1px solid #475569',
                borderRadius: 6,
                color: '#f8fafc',
                padding: '8px 10px',
                fontSize: 12,
                boxSizing: 'border-box',
                marginBottom: 10,
              }}
            />
            <button
              onClick={handleExchange}
              disabled={loading || !manualCodeInput}
              style={{
                width: '100%',
                backgroundColor: '#10b981',
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                padding: '8px 0',
                fontSize: 13,
                fontWeight: 600,
                cursor: loading || !manualCodeInput ? 'not-allowed' : 'pointer',
              }}
            >
              {loading ? 'Doğrulanıyor...' : 'Kodu Onayla ve Kaydet'}
            </button>
          </div>
        )}

        {/* Başlat Butonu (Henüz akış başlamadıysa) */}
        {!authUrlInfo && !deviceInfo && !successMsg && (
          <button
            onClick={handleStart}
            disabled={loading}
            style={{
              width: '100%',
              backgroundColor: '#3b82f6',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              padding: '10px 0',
              fontSize: 14,
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              marginTop: 6,
            }}
          >
            {loading ? 'Yetkilendirme Başlatılıyor...' : 'Giriş Başlat'}
          </button>
        )}

        {/* Kapat Butonu */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
          <button
            onClick={onClose}
            style={{
              backgroundColor: 'transparent',
              border: '1px solid #475569',
              color: '#cbd5e1',
              borderRadius: 6,
              padding: '6px 14px',
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            Kapat
          </button>
        </div>
      </div>
    </div>
  );
}
