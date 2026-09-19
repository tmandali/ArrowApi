import React, { useState } from 'react';
import {
  cborCodec,
  modelCatalog,
  MODEL_CATALOG,
  isolatedRunner,
} from '@my-agent/core';
import { useAgentVision, useAgentIndexedDB } from '@my-agent/react';

export function VisionAndStorageDemo() {
  const { capturedImages, isCapturing, captureSnapshot, clearImages, estimatedTokens } = useAgentVision();
  const { sessions, saveSession, deleteSession, refreshList } = useAgentIndexedDB();

  // CBOR Karşılaştırma Durumu
  const [cborResult, setCborResult] = useState<string | null>(null);

  // Model Fiyatlandırma Durumu
  const [selectedModel, setSelectedModel] = useState('gpt-4o');
  const [inTokens, setInTokens] = useState(1500);
  const [outTokens, setOutTokens] = useState(400);

  // Docker Sandbox Durumu
  const [sandboxResult, setSandboxResult] = useState<string | null>(null);

  const handleCborBenchmark = () => {
    const mockDataset = {
      storeId: 'Kadıköy',
      reportType: 'InventoryDetailedAnalysis',
      timestamp: Date.now(),
      records: Array.from({ length: 100 }, (_, i) => ({
        id: `SKU-${1000 + i}`,
        stock: Math.floor(Math.random() * 500),
        price: Number((Math.random() * 200).toFixed(2)),
        category: i % 2 === 0 ? 'Giyim' : 'Aksesuar',
      })),
    };

    const comparison = cborCodec.comparePayloadSizes(mockDataset);
    setCborResult(comparison.formatted);
  };

  const handleSaveToIndexedDb = async () => {
    const id = `sess_${Date.now()}`;
    await saveSession(id, {
      title: `Oturum Snapshot #${sessions.length + 1}`,
      createdAt: new Date().toLocaleTimeString(),
      sampleData: 'Büyük oturum kütüğü verisi...',
    });
  };

  const handleRunSandboxTask = async () => {
    const res = await isolatedRunner.runTask(
      'eval_security_sandbox',
      async () => {
        await new Promise((r) => setTimeout(r, 120));
        return { status: 'secure_pass', message: 'Tüm testler izole sandbox içinde başarıyla çalıştırıldı.' };
      },
      { mode: 'worker', timeoutMs: 3000 }
    );

    setSandboxResult(
      `✅ Sandbox Tipi: ${res.sandboxType} | Süre: ${res.durationMs}ms | Durum: ${res.result?.message}`
    );
  };

  const calculatedCost = modelCatalog.calculateCost(selectedModel, inTokens, outTokens);

  return (
    <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* 1. Vision & Snapshot Kartı */}
      <div style={{ padding: 14, backgroundColor: '#f0fdfa', border: '1px solid #99f6e4', borderRadius: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <strong style={{ fontSize: 13, color: '#115e59' }}>🖼️ Pi Vision / UI Snapshot Bridge</strong>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: '#0d9488' }}>
              Ekran görüntüsü alma, optimize etme ve base64 vision mesajı üretimi.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={() => captureSnapshot('demo_root', 'Canlı Arayüz Görüntüsü')}
              disabled={isCapturing}
              style={{
                padding: '5px 12px',
                backgroundColor: '#0d9488',
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 600,
                cursor: isCapturing ? 'not-allowed' : 'pointer',
              }}
            >
              {isCapturing ? 'Fotoğraflanıyor...' : '📸 UI Snapshot Al'}
            </button>
            {capturedImages.length > 0 && (
              <button
                onClick={clearImages}
                style={{ padding: '5px 8px', fontSize: 12, background: '#fff', border: '1px solid #ccfbf1', borderRadius: 6, cursor: 'pointer' }}
              >
                Sil ({capturedImages.length})
              </button>
            )}
          </div>
        </div>

        {capturedImages.length > 0 && (
          <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 12 }}>
            <img
              src={`data:${capturedImages[0].mimeType};base64,${capturedImages[0].base64Data}`}
              alt="Snapshot"
              style={{ width: 140, height: 78, objectFit: 'cover', borderRadius: 6, border: '1px solid #0d9488' }}
            />
            <div style={{ fontSize: 12, color: '#134e4a' }}>
              <div><strong>Son Görsel:</strong> {capturedImages[0].caption} (640x360)</div>
              <div><strong>Yaklaşık Token Maliyeti:</strong> ~{estimatedTokens} Vision Token</div>
              <div style={{ color: '#0f766e', fontSize: 11 }}>Multi-modal LLM çağrılarına otomatik iliştirilebilir.</div>
            </div>
          </div>
        )}
      </div>

      {/* 2. IndexedDB & CBOR Kartı */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {/* IndexedDB */}
        <div style={{ padding: 12, backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <strong style={{ fontSize: 12, color: '#1e293b' }}>🗄️ IndexedDB Storage (Sınırsız)</strong>
            <button
              onClick={handleSaveToIndexedDb}
              style={{ padding: '3px 8px', fontSize: 11, backgroundColor: '#3b82f6', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}
            >
              + Snapshot Kaydet
            </button>
          </div>
          <div style={{ fontSize: 11, color: '#64748b' }}>
            Kayıtlı Oturumlar: <strong>{sessions.length} adet</strong> (LocalStorage 5MB sınırı yoktur)
          </div>
          {sessions.length > 0 && (
            <div style={{ marginTop: 6, maxHeight: 60, overflowY: 'auto' }}>
              {sessions.map((s) => (
                <div key={s.sessionId} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, padding: '2px 0' }}>
                  <span>{s.sessionId} ({s.byteSize || 0} B)</span>
                  <button onClick={() => deleteSession(s.sessionId)} style={{ border: 'none', background: 'transparent', color: '#ef4444', cursor: 'pointer' }}>Sil</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* CBOR Binary Codec */}
        <div style={{ padding: 12, backgroundColor: '#fdf2f8', border: '1px solid #fbcfe8', borderRadius: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <strong style={{ fontSize: 12, color: '#831843' }}>📦 CBOR Binary Codec (RFC 8949)</strong>
            <button
              onClick={handleCborBenchmark}
              style={{ padding: '3px 8px', fontSize: 11, backgroundColor: '#db2777', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}
            >
              ⚡ 100 Kayıt Test Et
            </button>
          </div>
          <div style={{ fontSize: 11, color: '#9d174d' }}>
            {cborResult || '100 satırlık tablo verisini ikili bayt sıkıştırmayla test edin.'}
          </div>
        </div>
      </div>

      {/* 3. Dinamik Model Kataloğu & Docker Sandbox Kartı */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {/* Model Pricing */}
        <div style={{ padding: 12, backgroundColor: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8 }}>
          <strong style={{ fontSize: 12, color: '#92400e', display: 'block', marginBottom: 6 }}>
            🏷️ Model Fiyatlandırma Kataloğu
          </strong>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              style={{ fontSize: 11, padding: '3px 6px', borderRadius: 4, border: '1px solid #cbd5e1' }}
            >
              {Object.keys(MODEL_CATALOG).map((m) => (
                <option key={m} value={m}>{MODEL_CATALOG[m].name}</option>
              ))}
            </select>
            <span style={{ fontSize: 11, color: '#78350f', fontWeight: 700 }}>
              {calculatedCost.formatted}
            </span>
          </div>
          <div style={{ fontSize: 10, color: '#b45309' }}>
            Girdi: {inTokens} tok (${MODEL_CATALOG[selectedModel]?.inputPerMillionUsd}/1M) | Çıktı: {outTokens} tok
          </div>
        </div>

        {/* Docker Sandbox */}
        <div style={{ padding: 12, backgroundColor: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <strong style={{ fontSize: 12, color: '#1e293b' }}>🐳 İzole Sandbox / Docker Runner</strong>
            <button
              onClick={handleRunSandboxTask}
              style={{ padding: '3px 8px', fontSize: 11, backgroundColor: '#475569', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}
            >
              ▶️ Sandbox Koş
            </button>
          </div>
          <div style={{ fontSize: 10, color: '#475569' }}>
            {sandboxResult || 'Zaman aşımı ve bellek sınırlarıyla güvenli sandbox yürütme.'}
          </div>
        </div>
      </div>
    </div>
  );
}
