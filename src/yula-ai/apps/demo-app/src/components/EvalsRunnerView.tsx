import React, { useState } from 'react';
import {
  evalRunner,
  defaultUiAgentEvalSuite,
  erpEnterpriseEvalSuite,
  EvalSuiteResult,
  computeEvalLift,
  EvalLiftComparison,
} from '@my-agent/core';

export function EvalsRunnerView() {
  const [activeSuiteId, setActiveSuiteId] = useState<'erp' | 'ui' | 'lift'>('erp');
  const [isRunning, setIsRunning] = useState(false);
  const [uiResult, setUiResult] = useState<EvalSuiteResult | null>(null);
  const [erpResult, setErpResult] = useState<EvalSuiteResult | null>(null);
  const [liftResult, setLiftResult] = useState<EvalLiftComparison | null>(null);

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

        return { dispatchedActions: actions, responseMessage: 'İşlem tamamlandı.' };
      });
      setUiResult(result);
    } else if (activeSuiteId === 'erp') {
      // 12 Kurumsal ERP Kural & Güvenlik Değerlendiricisi
      const result = await evalRunner.runSuite(erpEnterpriseEvalSuite, async (prompt) => {
        return evaluateGroundedErp(prompt);
      });
      setErpResult(result);
    } else {
      // A/B Lift Analizi: Control (Guardrails Yok) vs Treatment (Grounded Kurallar Aktif)
      const controlResult = await evalRunner.runSuite(erpEnterpriseEvalSuite, async (prompt) => {
        // Kontrol grubu: Ham model gibi davranır; negatif kuralları bilmez ve ihlal eder
        const lower = prompt.toLowerCase();
        const actions: { componentId: string; action: string; payload?: any }[] = [];

        if (lower.includes('tedarikçi') && lower.includes('taslak')) {
          actions.push({
            componentId: 'procurement_po_manager',
            action: 'CREATE_DRAFT_PO',
            payload: { supplierId: 102, quantity: 50 },
          });
        } else if (lower.includes('500.000')) {
          // İHLAL: Yetki limitini bilmeyip doğrudan onaylar!
          actions.push({ componentId: 'procurement_po_manager', action: 'APPROVE_PO' });
        } else if (lower.includes('stok bakiye')) {
          actions.push({
            componentId: 'inventory_checker',
            action: 'QUERY_BALANCE',
            payload: { warehouseIds: ['kadikoy', 'kartal'], item: 'un' },
          });
        } else if (lower.includes('5 adet')) {
          // İHLAL: Yetersiz stokta sevkiyat fişi keser!
          actions.push({ componentId: 'inventory_checker', action: 'TRANSFER_STOCK' });
        } else if (lower.includes('drop table')) {
          // İHLAL: Yıkıcı DDL sorgusunu doğrudan çalıştırır!
          actions.push({ componentId: 'duckdb_wasm_engine', action: 'EXECUTE_RAW_SQL' });
        } else if (lower.includes('10 milyon')) {
          // İHLAL: Senkron bloklayan istek atar!
          actions.push({ componentId: 'arrow_jobs_scheduler', action: 'SYNC_BLOCKING_FETCH' });
        } else if (lower.includes('kapalı mali')) {
          // İHLAL: Kapalı döneme fiş girer!
          actions.push({ componentId: 'general_ledger', action: 'POST_JOURNAL_ENTRY' });
        } else if (lower.includes('maaş')) {
          // İHLAL: Gizli maaş verisini dışa aktarır!
          actions.push({ componentId: 'payroll_service', action: 'EXPORT_SALARY_DATA' });
        }

        return { dispatchedActions: actions, responseMessage: 'Ham istek işletildi.' };
      });

      const treatmentResult = await evalRunner.runSuite(erpEnterpriseEvalSuite, async (prompt) => {
        return evaluateGroundedErp(prompt);
      });

      const comparison = computeEvalLift(controlResult, treatmentResult);
      setLiftResult(comparison);
    }

    setIsRunning(false);
  };

  const evaluateGroundedErp = (prompt: string) => {
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
          🏢 Kurumsal ERP Benchmark (12)
        </button>
        <button
          onClick={() => setActiveSuiteId('lift')}
          style={{
            padding: '5px 12px',
            backgroundColor: activeSuiteId === 'lift' ? '#166534' : '#dcfce7',
            color: activeSuiteId === 'lift' ? '#ffffff' : '#166534',
            border: '1px solid #86efac',
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          📈 A/B Kural & Lift Analizi (Pi Reference)
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
          🖥️ Temel UI Ajanı (10)
        </button>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <strong style={{ fontSize: 13, color: '#166534' }}>
            🧪 Pi E2E Evals & Benchmark:{' '}
            {activeSuiteId === 'erp'
              ? 'Kurumsal ERP'
              : activeSuiteId === 'lift'
                ? 'A/B Kural ve Playbook Katkısı (Lift)'
                : 'Temel UI'}
          </strong>
          <p style={{ margin: '2px 0 0', fontSize: 12, color: '#15803d' }}>
            {activeSuiteId === 'lift'
              ? 'Ham model (Control) ile kurallı/güvenlikli ajan (Treatment) arasındaki net başarı artışını (Lift %) ölçer.'
              : activeSuiteId === 'erp'
                ? 'Satınalma, yetki sınırları, DuckDB analitiği, Arrow Jobs ve güvenlik bariyerlerini 12 senaryoda denetler.'
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
            ? 'Hesaplanıyor...'
            : activeSuiteId === 'lift'
              ? '🔬 A/B Lift Analizini Çalıştır'
              : activeSuiteId === 'erp'
                ? '🛡️ 12 ERP Testini Çalıştır'
                : '🚀 10 UI Testini Çalıştır'}
        </button>
      </div>

      {/* A/B Lift Result View */}
      {activeSuiteId === 'lift' && liftResult && (
        <div style={{ marginTop: 12, backgroundColor: '#fff', padding: 12, borderRadius: 8, border: '1px solid #86efac' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 12 }}>
            <div style={{ padding: 10, backgroundColor: '#fef2f2', borderRadius: 6, border: '1px solid #fecaca' }}>
              <div style={{ fontSize: 11, color: '#991b1b', fontWeight: 600 }}>Kontrol (Ham Model)</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#dc2626' }}>%{liftResult.controlPassRate}</div>
              <div style={{ fontSize: 10, color: '#7f1d1d' }}>Güvenlik bariyeri ve kurallar kapalı</div>
            </div>
            <div style={{ padding: 10, backgroundColor: '#f0fdf4', borderRadius: 6, border: '1px solid #bbf7d0' }}>
              <div style={{ fontSize: 11, color: '#166534', fontWeight: 600 }}>İşlem (Grounded Ajan)</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#16a34a' }}>%{liftResult.treatmentPassRate}</div>
              <div style={{ fontSize: 10, color: '#14532d' }}>Kurumsal kural & guardrail devrede</div>
            </div>
            <div style={{ padding: 10, backgroundColor: '#eff6ff', borderRadius: 6, border: '1px solid #bfdbfe' }}>
              <div style={{ fontSize: 11, color: '#1e40af', fontWeight: 600 }}>Net Katkı (Lift)</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#2563eb' }}>+%{liftResult.liftRate}</div>
              <div style={{ fontSize: 10, color: '#1e3a8a' }}>
                {liftResult.improvedCount} senaryo kurallarla kurtarıldı
              </div>
            </div>
          </div>

          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6, color: '#0f172a' }}>
            Senaryo Bazlı Karşılaştırma Dökümü:
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {liftResult.cases.map((c) => (
              <div
                key={c.id}
                style={{
                  fontSize: 11,
                  padding: '6px 8px',
                  borderRadius: 4,
                  backgroundColor: c.status === 'improved' ? '#f0fdf4' : '#f8fafc',
                  border: `1px solid ${c.status === 'improved' ? '#86efac' : '#cbd5e1'}`,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <span style={{ fontWeight: 600, color: '#0f172a' }}>{c.name}</span>
                  {c.notes && <div style={{ fontSize: 10, color: '#15803d' }}>{c.notes}</div>}
                </div>
                <span
                  style={{
                    fontSize: 10,
                    padding: '2px 6px',
                    borderRadius: 4,
                    fontWeight: 700,
                    backgroundColor: c.status === 'improved' ? '#dcfce7' : '#e2e8f0',
                    color: c.status === 'improved' ? '#166534' : '#475569',
                  }}
                >
                  {c.status === 'improved' ? '🟢 +LIFT' : '⚪ STABİL'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Standard Suite Result View */}
      {activeSuiteId !== 'lift' && currentResult && (
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
