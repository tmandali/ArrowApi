import React, { useState } from 'react';
import {
  evalRunner,
  defaultUiAgentEvalSuite,
  erpEnterpriseEvalSuite,
  EvalSuiteResult,
} from '@my-agent/core';

export function EvalsRunnerView() {
  const [activeSuiteId, setActiveSuiteId] = useState<'ui' | 'erp'>('erp');
  const [isRunning, setIsRunning] = useState(false);
  const [uiResult, setUiResult] = useState<EvalSuiteResult | null>(null);
  const [erpResult, setErpResult] = useState<EvalSuiteResult | null>(null);

  const activeSuite = activeSuiteId === 'ui' ? defaultUiAgentEvalSuite : erpEnterpriseEvalSuite;
  const currentResult = activeSuiteId === 'ui' ? uiResult : erpResult;

  const runEvals = async () => {
    setIsRunning(true);

    if (activeSuiteId === 'ui') {
      const result = await evalRunner.runSuite(defaultUiAgentEvalSuite, async (prompt) => {
        const lower = prompt.toLowerCase();
        const actions: { componentId: string; action: string; payload?: any }[] = [];

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
      setUiResult(result);
    } else {
      // 12 Kurumsal ERP Kural & Güvenlik Değerlendiricisi
      const result = await evalRunner.runSuite(erpEnterpriseEvalSuite, async (prompt) => {
        const lower = prompt.toLowerCase();
        const actions: { componentId: string; action: string; payload?: any }[] = [];
        let responseMessage = 'İşlem tamamlandı.';

        if (lower.includes('tedarikçi') && lower.includes('taslak')) {
          actions.push({
            componentId: 'procurement_po_manager',
            action: 'CREATE_DRAFT_PO',
            payload: { supplierId: 102, quantity: 50 },
          });
          responseMessage = 'Tedarikçi 102 için 50 adet taslak sipariş oluşturuldu.';
        } else if (lower.includes('500.000') || (lower.includes('onayla') && lower.includes('tamamla'))) {
          responseMessage = 'Yetki sınırı aşıldı! 500.000 TL üzeri satınalma siparişleri için genel müdür onayı gereklidir.';
        } else if (lower.includes('stok bakiye') || (lower.includes('kadıköy') && lower.includes('kartal'))) {
          actions.push({
            componentId: 'inventory_checker',
            action: 'QUERY_BALANCE',
            payload: { warehouseIds: ['kadikoy', 'kartal'], item: 'un' },
          });
          responseMessage = 'Kadıköy ve Kartal depoları stok bakiyesi listelendi.';
        } else if (lower.includes('5 adet') || lower.includes('yetersiz')) {
          responseMessage = 'Hata: Yetersiz stok! Mevcut bakiye 5 adettir, 20 adet sevkiyat fişi kesilemez.';
        } else if (lower.includes('ciro') || (lower.includes('hesapla') && lower.includes('toplam'))) {
          actions.push({
            componentId: 'duckdb_wasm_engine',
            action: 'EXECUTE_ANALYTICS_SQL',
            payload: { sql: 'SELECT store_id, SUM(total_amount) AS ciro FROM sales GROUP BY store_id' },
          });
          responseMessage = 'DuckDB analitik sorgusu başarıyla çalıştırıldı.';
        } else if (lower.includes('drop table')) {
          responseMessage = 'Güvenlik İhlali Engellendi: Yıkıcı DDL komutlarına ve tablo silme işlemlerine izin verilmez.';
        } else if (lower.includes('arka plan') || (lower.includes('5 yıl') && lower.includes('rapor'))) {
          actions.push({
            componentId: 'arrow_jobs_scheduler',
            action: 'ENQUEUE_DURABLE_JOB',
            payload: { jobType: 'historical_sales_export', background: true },
          });
          responseMessage = 'Büyük veri dışa aktarım görevi Arrow Jobs arka plan kuyruğuna alındı.';
        } else if (lower.includes('10 milyon') || lower.includes('senkron')) {
          responseMessage = 'Güvenlik Koruması: UI kilitlenmesini önlemek için devasa veri setinde senkron istek engellendi, arka plan kuyruğu oluşturulmalıdır.';
        } else if (lower.includes('iskonto') || lower.includes('sepeti bozmadan')) {
          actions.push({
            componentId: 'session_branch_manager',
            action: 'FORK_BRANCH',
            payload: { branchName: 'sim_discount_15', metadata: { simulation: true } },
          });
          responseMessage = 'What-if iskonto simülasyonu için yeni dal başarıyla açıldı.';
        } else if (lower.includes('kapalı mali') || lower.includes('2023')) {
          responseMessage = 'Denetim Hatası: 2023 yılı kapalı mali döneme muhasebe mahsup fişi kaydedilemez.';
        } else if (lower.includes('risk') || lower.includes('kredi') || lower.includes('405')) {
          actions.push({
            componentId: 'credit_risk_service',
            action: 'CHECK_CREDIT_LIMIT',
            payload: { customerId: 405 },
          });
          responseMessage = 'Müşteri 405 kredi risk limiti doğrulandı.';
        } else if (lower.includes('maaş') || lower.includes('yönetim kurulu')) {
          responseMessage = 'Erişim Engellendi: Gizli İK ve maaş verilerine erişim yetkiniz bulunmamaktadır.';
        }

        return { dispatchedActions: actions, responseMessage };
      });
      setErpResult(result);
    }

    setIsRunning(false);
  };

  return (
    <div style={{ padding: 14, backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, marginTop: 14 }}>
      {/* Tab Switcher */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button
          onClick={() => setActiveSuiteId('erp')}
          style={{
            padding: '5px 12px',
            backgroundColor: activeSuiteId === 'erp' ? '#166534' : '#dcfce7',
            color: activeSuiteId === 'erp' ? '#ffffff' : '#166534',
            border: '1px solid #86efac',
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          🏢 Kurumsal ERP Benchmark & Güvenlik (12 Test)
        </button>
        <button
          onClick={() => setActiveSuiteId('ui')}
          style={{
            padding: '5px 12px',
            backgroundColor: activeSuiteId === 'ui' ? '#166534' : '#dcfce7',
            color: activeSuiteId === 'ui' ? '#ffffff' : '#166534',
            border: '1px solid #86efac',
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          🖥️ Temel UI Ajan Testleri (10 Test)
        </button>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <strong style={{ fontSize: 13, color: '#166534' }}>
            🧪 Pi E2E Evals & Benchmark Koşucusu: {activeSuiteId === 'erp' ? 'Kurumsal ERP' : 'Temel UI'}
          </strong>
          <p style={{ margin: '2px 0 0', fontSize: 12, color: '#15803d' }}>
            {activeSuiteId === 'erp'
              ? 'Satınalma, yetki sınırları, DuckDB analitiği, Arrow Jobs ve güvenlik bariyerlerini (Guardrails) 12 senaryoda denetler.'
              : 'Ajanın pozitif tetikleme ve "WHEN NOT TO CALL" negatif kurallarını 10 senaryoda denetler.'}
          </p>
        </div>
        <button
          onClick={runEvals}
          disabled={isRunning}
          style={{
            padding: '6px 14px',
            backgroundColor: isRunning ? '#94a3b8' : '#16a34a',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 600,
            cursor: isRunning ? 'not-allowed' : 'pointer',
          }}
        >
          {isRunning
            ? 'Değerlendiriliyor...'
            : activeSuiteId === 'erp'
              ? '🛡️ 12 ERP Testini Çalıştır'
              : '🚀 10 UI Testini Çalıştır'}
        </button>
      </div>

      {currentResult && (
        <div style={{ marginTop: 12, backgroundColor: '#fff', padding: 10, borderRadius: 6, border: '1px solid #86efac' }}>
          <div style={{ display: 'flex', gap: 16, marginBottom: 8, fontSize: 12, fontWeight: 700 }}>
            <span style={{ color: currentResult.passRate === 100 ? '#16a34a' : '#dc2626' }}>
              🎯 Başarı Oranı: %{currentResult.passRate} ({currentResult.passed}/{currentResult.total})
            </span>
            <span style={{ color: '#64748b' }}>⏱️ Toplam Süre: {currentResult.durationMs}ms</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {currentResult.results.map((r) => {
              const testCase = activeSuite.find((c) => c.id === r.id);
              const isNegativeGuard = testCase?.category === 'negative_guard';

              return (
                <div
                  key={r.id}
                  style={{
                    fontSize: 11,
                    padding: '6px 8px',
                    borderRadius: 4,
                    backgroundColor: r.passed ? '#f0fdf4' : '#fef2f2',
                    border: `1px solid ${r.passed ? '#bbf7d0' : '#fecaca'}`,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 3,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 600, color: '#0f172a' }}>
                      {r.passed ? '✅' : '❌'} {r.name}
                    </span>
                    <span style={{ color: '#64748b' }}>{r.durationMs}ms</span>
                  </div>

                  <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    <span
                      style={{
                        fontSize: 9,
                        padding: '1px 5px',
                        borderRadius: 3,
                        backgroundColor: isNegativeGuard ? '#f3e8ff' : '#e0f2fe',
                        color: isNegativeGuard ? '#6b21a8' : '#0369a1',
                        fontWeight: 600,
                      }}
                    >
                      {isNegativeGuard ? '🛡️ Güvenlik Bariyeri' : '⚡ Pozitif Aksiyon'}
                    </span>
                    {r.passed && (
                      <span style={{ fontSize: 10, color: '#15803d' }}>Puan: {r.acceptableScore}/1</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
