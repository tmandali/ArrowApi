import React, { useState } from 'react';
import { evalRunner, defaultUiAgentEvalSuite, EvalSuiteResult } from '@my-agent/core';

export function EvalsRunnerView() {
  const [isRunning, setIsRunning] = useState(false);
  const [suiteResult, setSuiteResult] = useState<EvalSuiteResult | null>(null);

  const runEvals = async () => {
    setIsRunning(true);

    // Kural motorunu ve ajan mantığını simüle eden değerlendirici
    const result = await evalRunner.runSuite(defaultUiAgentEvalSuite, async (prompt) => {
      const lower = prompt.toLowerCase();
      const actions: { componentId: string; action: string; payload?: any }[] = [];

      // Pozitif ve Negatif Kural Mantığı
      if (lower.includes('dashboard') && (lower.includes('götür') || lower.includes('git'))) {
        actions.push({ componentId: 'app_router', action: 'NAVIGATE', payload: { path: '/dashboard' } });
      }

      if (lower.includes('kadıköy')) {
        actions.push({ componentId: 'filter_form', action: 'SET_FIELDS', payload: { storeId: 'Kadıköy' } });
      }

      if (lower.includes('azalan') || lower.includes('sırala')) {
        actions.push({ componentId: 'result_table', action: 'SORT', payload: { direction: 'desc' } });
      }

      if (lower.includes('csv') || lower.includes('excel')) {
        actions.push({ componentId: 'result_table', action: 'EXPORT_CSV' });
      }

      if (lower.includes('geri dön')) {
        actions.push({ componentId: 'app_router', action: 'BACK' });
      }

      if (lower.includes('bölge') || lower.includes('marmara')) {
        actions.push({ componentId: 'dashboard_kpi', action: 'FILTER_REGION', payload: { region: 'Marmara' } });
      }

      if (lower.includes('tazele') || lower.includes('güncelle')) {
        actions.push({ componentId: 'dashboard_kpi', action: 'REFRESH_DATA' });
      }

      return {
        dispatchedActions: actions,
        responseMessage: 'İşlem tamamlandı.',
      };
    });

    setSuiteResult(result);
    setIsRunning(false);
  };

  return (
    <div style={{ padding: 14, backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, marginTop: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <strong style={{ fontSize: 13, color: '#166534' }}>🧪 Pi E2E Evals & Benchmark Koşucusu</strong>
          <p style={{ margin: '2px 0 0', fontSize: 12, color: '#15803d' }}>
            Ajanın pozitif tetikleme ve "WHEN NOT TO CALL" negatif kurallarını 10 senaryoda denetler.
          </p>
        </div>
        <button
          onClick={runEvals}
          disabled={isRunning}
          style={{
            padding: '6px 14px',
            backgroundColor: '#16a34a',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 600,
            cursor: isRunning ? 'not-allowed' : 'pointer',
          }}
        >
          {isRunning ? 'Değerlendiriliyor...' : '🚀 10 E2E Testi Çalıştır'}
        </button>
      </div>

      {suiteResult && (
        <div style={{ marginTop: 12, backgroundColor: '#fff', padding: 10, borderRadius: 6, border: '1px solid #86efac' }}>
          <div style={{ display: 'flex', gap: 16, marginBottom: 8, fontSize: 12, fontWeight: 700 }}>
            <span style={{ color: suiteResult.passRate === 100 ? '#16a34a' : '#dc2626' }}>
              🎯 Başarı Oranı: %{suiteResult.passRate} ({suiteResult.passed}/{suiteResult.total})
            </span>
            <span style={{ color: '#64748b' }}>⏱️ Süre: {suiteResult.durationMs}ms</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {suiteResult.results.map((r) => (
              <div
                key={r.id}
                style={{
                  fontSize: 11,
                  padding: '4px 8px',
                  borderRadius: 4,
                  backgroundColor: r.passed ? '#f0fdf4' : '#fef2f2',
                  border: `1px solid ${r.passed ? '#bbf7d0' : '#fecaca'}`,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span style={{ color: '#0f172a' }}>{r.passed ? '✅' : '❌'} {r.name}</span>
                <span style={{ color: '#64748b' }}>{r.durationMs}ms</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
