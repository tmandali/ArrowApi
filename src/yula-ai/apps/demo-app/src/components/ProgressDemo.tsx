import React, { useState } from 'react';
import { progressManager, piEventStream } from '@my-agent/core';
import { useAgentProgress } from '@my-agent/react';

export function ProgressDemo() {
  const [isRunning, setIsRunning] = useState(false);
  const { activeProgress } = useAgentProgress();

  const runSimulatedLongTask = async () => {
    if (isRunning) return;
    setIsRunning(true);

    const callId = `progress_task_${Date.now()}`;
    const reporter = progressManager.createReporter(callId, 'generate_massive_report');

    piEventStream.emit({
      type: 'tool_execution_start',
      toolCallId: callId,
      toolName: 'generate_massive_report',
      args: { scope: 'all_stores', year: 2026 },
    });

    const stages = [
      { pct: 15, msg: 'Veritabanı bağlantısı kuruluyor...' },
      { pct: 35, msg: '250.000 satır satış verisi çekiliyor...' },
      { pct: 60, msg: 'Bölgesel pivot tabloları hesaplanıyor...' },
      { pct: 85, msg: 'Excel ve CSV çıktısı derleniyor...' },
      { pct: 100, msg: 'Rapor hazırlandı ve arayüze aktarıldı!' },
    ];

    for (const stage of stages) {
      reporter.report(stage.pct, stage.msg);
      await new Promise((r) => setTimeout(r, 600));
    }

    reporter.done('Tamamlandı');
    piEventStream.emit({
      type: 'tool_execution_end',
      toolCallId: callId,
      toolName: 'generate_massive_report',
      result: { totalRecords: 250000, downloadUrl: '/reports/2026-massive.csv' },
      isError: false,
    });

    setIsRunning(false);
  };

  return (
    <div style={{ padding: 14, backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, marginTop: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <strong style={{ fontSize: 13, color: '#0f172a' }}>⏳ Pi Tool Progress Streaming Demo</strong>
          <p style={{ margin: '2px 0 0', fontSize: 12, color: '#64748b' }}>
            Uzun süren araçların ara çıktılarını canlı akıtan ProgressChannel simülasyonu.
          </p>
        </div>
        <button
          onClick={runSimulatedLongTask}
          disabled={isRunning}
          style={{
            padding: '6px 12px',
            backgroundColor: isRunning ? '#94a3b8' : '#0284c7',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            cursor: isRunning ? 'not-allowed' : 'pointer',
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          {isRunning ? 'İşleniyor (% Canlı)...' : '▶️ Ağır Rapor Başlat'}
        </button>
      </div>

      {activeProgress.length > 0 && (
        <div style={{ marginTop: 10, padding: 8, backgroundColor: '#fff', borderRadius: 6, border: '1px solid #bae6fd' }}>
          {activeProgress.map((p) => (
            <div key={p.toolCallId} style={{ fontSize: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ color: '#0369a1', fontWeight: 600 }}>{p.message}</span>
                <span style={{ color: '#0284c7', fontWeight: 700 }}>%{p.percentage}</span>
              </div>
              <div style={{ width: '100%', height: 6, backgroundColor: '#e0f2fe', borderRadius: 3, overflow: 'hidden' }}>
                <div
                  style={{
                    width: `${p.percentage}%`,
                    height: '100%',
                    backgroundColor: '#0284c7',
                    transition: 'width 0.3s ease-in-out',
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
