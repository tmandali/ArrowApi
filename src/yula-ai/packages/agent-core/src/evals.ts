import { uiRegistry } from './component-registry';

export interface EvalTestCase {
  id: string;
  name: string;
  category: 'positive_action' | 'negative_guard' | 'schema_validation' | 'navigation';
  prompt: string;
  expectedAction?: {
    componentId: string;
    action: string;
    payloadMatcher?: (payload: any) => boolean;
  };
  forbiddenActions?: {
    componentId: string;
    action: string;
  }[];
  expectedErrorKeyword?: string;
}

export interface EvalCaseResult {
  id: string;
  name: string;
  passed: boolean;
  durationMs: number;
  message: string;
  diagnostics?: any;
}

export interface EvalSuiteResult {
  total: number;
  passed: number;
  failed: number;
  passRate: number; // 0 - 100
  durationMs: number;
  results: EvalCaseResult[];
}

export class EvalRunner {
  async runSuite(
    testCases: EvalTestCase[],
    executor: (prompt: string) => Promise<{
      dispatchedActions: { componentId: string; action: string; payload?: any }[];
      responseMessage?: string;
      error?: string;
    }>
  ): Promise<EvalSuiteResult> {
    const startTime = Date.now();
    const results: EvalCaseResult[] = [];

    for (const testCase of testCases) {
      const caseStart = Date.now();
      try {
        const execution = await executor(testCase.prompt);
        let passed = true;
        let message = 'Başarılı';

        // 1. Pozitif Eylem Kontrolü
        if (testCase.expectedAction) {
          const found = execution.dispatchedActions.find(
            (a) =>
              a.componentId === testCase.expectedAction?.componentId &&
              a.action === testCase.expectedAction?.action
          );

          if (!found) {
            passed = false;
            message = `Beklenen eylem tetiklenmedi: ${testCase.expectedAction.componentId}.${testCase.expectedAction.action}`;
          } else if (testCase.expectedAction.payloadMatcher && !testCase.expectedAction.payloadMatcher(found.payload)) {
            passed = false;
            message = `Eylem parametreleri şablonla uyuşmadı: ${JSON.stringify(found.payload)}`;
          }
        }

        // 2. Negatif Sınır Kontrolü (WHEN NOT TO CALL Koruması)
        if (passed && testCase.forbiddenActions) {
          for (const forbidden of testCase.forbiddenActions) {
            const forbiddenFound = execution.dispatchedActions.find(
              (a) => a.componentId === forbidden.componentId && a.action === forbidden.action
            );
            if (forbiddenFound) {
              passed = false;
              message = `KURAL İHLALİ (WHEN NOT TO CALL): "${forbidden.componentId}.${forbidden.action}" tetiklenmemeliydi!`;
              break;
            }
          }
        }

        // 3. Beklenen Hata Mesajı Kontrolü
        if (passed && testCase.expectedErrorKeyword) {
          const hasKeyword = (execution.error || execution.responseMessage || '').includes(
            testCase.expectedErrorKeyword
          );
          if (!hasKeyword) {
            passed = false;
            message = `Beklenen hata kelimesi bulunamadı: "${testCase.expectedErrorKeyword}"`;
          }
        }

        results.push({
          id: testCase.id,
          name: testCase.name,
          passed,
          durationMs: Date.now() - caseStart,
          message,
          diagnostics: execution,
        });
      } catch (err: any) {
        results.push({
          id: testCase.id,
          name: testCase.name,
          passed: false,
          durationMs: Date.now() - caseStart,
          message: `İstisna fırlatıldı: ${err?.message || err}`,
        });
      }
    }

    const passedCount = results.filter((r) => r.passed).length;
    const durationMs = Date.now() - startTime;

    return {
      total: results.length,
      passed: passedCount,
      failed: results.length - passedCount,
      passRate: results.length > 0 ? Math.round((passedCount / results.length) * 100) : 0,
      durationMs,
      results,
    };
  }
}

export const evalRunner = new EvalRunner();

/**
 * Headless UI Agent için Standart 10'lu Kıyaslama Test Paketi
 */
export const defaultUiAgentEvalSuite: EvalTestCase[] = [
  {
    id: 'eval_nav_positive',
    name: 'Açıkça Sayfa Geçişi Talebi (Pozitif Sınır)',
    category: 'positive_action',
    prompt: 'Beni Dashboard ekranına götür',
    expectedAction: { componentId: 'app_router', action: 'NAVIGATE' },
    forbiddenActions: [{ componentId: 'filter_form', action: 'SUBMIT' }],
  },
  {
    id: 'eval_nav_negative',
    name: 'Soru Sorulduğunda Sayfayı Değiştirmeme (Negatif Sınır)',
    category: 'negative_guard',
    prompt: 'Dashboard sayfasında hangi grafikler var?',
    forbiddenActions: [{ componentId: 'app_router', action: 'NAVIGATE' }],
  },
  {
    id: 'eval_form_set_fields',
    name: 'Filtre Değerlerini Doldurma',
    category: 'positive_action',
    prompt: 'Kadıköy mağazasını seç',
    expectedAction: { componentId: 'filter_form', action: 'SET_FIELDS' },
    forbiddenActions: [{ componentId: 'filter_form', action: 'SUBMIT' }],
  },
  {
    id: 'eval_form_submit_guard',
    name: 'Eksik Form Göndermeme Koruması',
    category: 'negative_guard',
    prompt: 'Raporu hemen çalıştır',
    forbiddenActions: [{ componentId: 'filter_form', action: 'SUBMIT' }],
  },
  {
    id: 'eval_table_sort',
    name: 'Tablo Sıralama Eylemi',
    category: 'positive_action',
    prompt: 'Sonuçları azalan sırada listele',
    expectedAction: { componentId: 'result_table', action: 'SORT' },
  },
  {
    id: 'eval_table_export',
    name: 'CSV Dışa Aktarma Eylemi',
    category: 'positive_action',
    prompt: 'Bu tabloyu Excel veya CSV olarak indir',
    expectedAction: { componentId: 'result_table', action: 'EXPORT_CSV' },
  },
  {
    id: 'eval_router_back',
    name: 'Geri Dönüş Eylemi',
    category: 'positive_action',
    prompt: 'Bir önceki sayfaya geri dön',
    expectedAction: { componentId: 'app_router', action: 'BACK' },
  },
  {
    id: 'eval_dashboard_filter',
    name: 'Dashboard Bölge Filtreleme',
    category: 'positive_action',
    prompt: 'Marmara bölgesindeki mağazaları filtrele',
    expectedAction: { componentId: 'dashboard_kpi', action: 'FILTER_REGION' },
  },
  {
    id: 'eval_dashboard_refresh',
    name: 'Canlı Veri Tazeleme',
    category: 'positive_action',
    prompt: 'KPI göstergelerini güncelle',
    expectedAction: { componentId: 'dashboard_kpi', action: 'REFRESH_DATA' },
  },
  {
    id: 'eval_silent_reflection',
    name: 'Salt Bilgi İstendiğinde Aksiyonsuz Kalma',
    category: 'negative_guard',
    prompt: 'Bu ekrandaki butonlar ne işe yarıyor?',
    forbiddenActions: [
      { componentId: 'app_router', action: 'NAVIGATE' },
      { componentId: 'filter_form', action: 'SUBMIT' },
    ],
  },
];
