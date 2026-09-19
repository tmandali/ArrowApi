import React, { useRef } from 'react';
import { useAgentReplay } from '@my-agent/react';

export function ReplayScrubber() {
  const {
    entries,
    totalCount,
    isReplaying,
    currentStep,
    totalSteps,
    replayTo,
    exportJSONL,
    importJSONL,
    saveToStorage,
    loadFromStorage,
    clearJournal,
  } = useAgentReplay();

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDownloadJSONL = () => {
    const jsonl = exportJSONL();
    const blob = new Blob([jsonl], { type: 'application/x-ndjson' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pi_session_${Date.now()}.jsonl`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        importJSONL(content);
        alert(`✅ ${content.split('\n').filter(Boolean).length} adet olay JSONL kütüğünden yüklendi!`);
      }
    };
    reader.readAsText(file);
  };

  return (
    <div style={{ padding: 14, backgroundColor: '#fdf4ff', border: '1px solid #f5d0fe', borderRadius: 8, marginTop: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div>
          <strong style={{ fontSize: 13, color: '#701a75' }}>📼 Pi Session Replay & JSONL Kütüğü</strong>
          <span style={{ marginLeft: 8, fontSize: 11, backgroundColor: '#fae8ff', color: '#86198f', padding: '2px 6px', borderRadius: 4 }}>
            {totalCount} Olay Kayıtlı
          </span>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={() => replayTo(totalCount)}
            disabled={totalCount === 0 || isReplaying}
            style={{
              padding: '4px 10px',
              backgroundColor: '#a21caf',
              color: '#fff',
              border: 'none',
              borderRadius: 4,
              fontSize: 11,
              fontWeight: 600,
              cursor: totalCount === 0 || isReplaying ? 'not-allowed' : 'pointer',
            }}
          >
            {isReplaying ? `Oynatılıyor (${currentStep}/${totalSteps})...` : '▶️ Baştan Oynat (Replay)'}
          </button>
          <button
            onClick={handleDownloadJSONL}
            disabled={totalCount === 0}
            style={{ padding: '4px 8px', fontSize: 11, background: '#fff', border: '1px solid #e879f9', borderRadius: 4, cursor: 'pointer' }}
          >
            ⬇️ JSONL İndir
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            style={{ padding: '4px 8px', fontSize: 11, background: '#fff', border: '1px solid #e879f9', borderRadius: 4, cursor: 'pointer' }}
          >
            ⬆️ JSONL Yükle
          </button>
          <input ref={fileInputRef} type="file" accept=".jsonl,.txt" style={{ display: 'none' }} onChange={handleFileChange} />
          <button
            onClick={saveToStorage}
            style={{ padding: '4px 8px', fontSize: 11, background: '#fff', border: '1px solid #e879f9', borderRadius: 4, cursor: 'pointer' }}
          >
            💾 Kaydet
          </button>
          <button
            onClick={loadFromStorage}
            style={{ padding: '4px 8px', fontSize: 11, background: '#fff', border: '1px solid #e879f9', borderRadius: 4, cursor: 'pointer' }}
          >
            📂 Yükle
          </button>
          <button
            onClick={clearJournal}
            style={{ padding: '4px 8px', fontSize: 11, background: '#fee2e2', border: '1px solid #fca5a5', color: '#991b1b', borderRadius: 4, cursor: 'pointer' }}
          >
            🗑️ Temizle
          </button>
        </div>
      </div>

      {isReplaying && (
        <div style={{ marginTop: 6, fontSize: 12, color: '#a21caf', fontWeight: 600 }}>
          Zaman Çizgisinde Oynatılıyor: Adım {currentStep} / {totalSteps}
        </div>
      )}
    </div>
  );
}
