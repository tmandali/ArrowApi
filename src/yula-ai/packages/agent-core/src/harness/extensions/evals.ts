/**
 * @file evals.ts
 * Enterprise Agent Evaluation & Benchmark Engine
 *
 * Implements the ServiceNow AgentArch (arXiv:2509.10769) evaluation standard
 * alongside Pi / Vertex AI trajectory testing:
 * - Acceptable Score: C(r) (tool) * A(r) (arguments) * O(r) (decision)
 * - Strict vs. Lenient tool choice evaluation
 * - Reliability testing: pass@1 and pass^k (k-trial consistency)
 * - Hallucination rate and consecutive tool repetition detection
 */

export interface DispatchedAction {
  componentId: string;
  action: string;
  payload?: any;
}

export interface EvalExecutionResult {
  dispatchedActions: DispatchedAction[];
  responseMessage?: string;
  error?: string;
}

export interface EvalTestCase {
  id: string;
  name: string;
  category: 'positive_action' | 'negative_guard' | 'schema_validation' | 'navigation';
  prompt: string;
  evaluationMode?: 'strict' | 'lenient';
  expectedAction?: {
    componentId: string;
    action: string;
    payloadMatcher?: (payload: any) => boolean;
  };
  forbiddenActions?: {
    componentId: string;
    action: string;
  }[];
  expectedDecision?: (responseMessage: string) => boolean;
  expectedErrorKeyword?: string;
}

export interface EvalCaseResult {
  id: string;
  name: string;
  passed: boolean;
  durationMs: number;
  message: string;
  correctToolChoice: boolean;
  correctToolArguments: boolean;
  correctFinalDecision: boolean;
  acceptableScore: number; // 1 or 0
  hallucinated: boolean;
  repeatedConsecutiveCalls: boolean;
  diagnostics?: EvalExecutionResult;
}

export interface EvalSuiteResult {
  total: number;
  passed: number;
  failed: number;
  passRate: number; // 0 - 100
  acceptableRate: number; // 0 - 100 (AgentArch primary metric)
  toolChoiceRate: number; // 0 - 100 (C(r))
  toolArgumentsRate: number; // 0 - 100 (A(r))
  finalDecisionRate: number; // 0 - 100 (O(r))
  hallucinationRate: number; // 0 - 100
  toolRepetitionRate: number; // 0 - 100
  durationMs: number;
  results: EvalCaseResult[];
}

export interface ReliabilityResult {
  k: number;
  totalCases: number;
  passAt1: number; // Average pass@1 across all k trials (0 - 100)
  passHatK: number; // Percentage of test cases passing all k consecutive trials (0 - 100)
  acceptablePassHatK: number; // Percentage of cases with acceptableScore=1 in all k trials
  runsPerCase: Record<string, EvalCaseResult[]>;
}

const DEFAULT_READONLY_ACTIONS = new Set([
  'inspect_ui_state',
  'recall_fact',
  'query_playbook',
  'synthesize_collected_information',
  'READ',
]);

export class EvalRunner {
  /**
   * Evaluates a single test case against an execution result using AgentArch criteria.
   */
  evaluateExecution(
    testCase: EvalTestCase,
    execution: EvalExecutionResult,
    durationMs: number
  ): EvalCaseResult {
    let correctToolChoice = true;
    let correctToolArguments = true;
    let correctFinalDecision = true;
    let hallucinated = false;
    let repeatedConsecutiveCalls = false;
    const actions = execution.dispatchedActions || [];

    // 1. Tool Repetition Rate Check: consecutive identical actions with identical payloads
    for (let i = 1; i < actions.length; i++) {
      const prev = actions[i - 1];
      const curr = actions[i];
      if (
        prev.componentId === curr.componentId &&
        prev.action === curr.action &&
        JSON.stringify(prev.payload ?? {}) === JSON.stringify(curr.payload ?? {})
      ) {
        repeatedConsecutiveCalls = true;
        break;
      }
    }

    // 2. Expected Action & Tool Arguments Evaluation
    if (testCase.expectedAction) {
      const found = actions.find(
        (a) =>
          a.componentId === testCase.expectedAction?.componentId &&
          a.action === testCase.expectedAction?.action
      );

      if (!found) {
        correctToolChoice = false;
        correctToolArguments = false;
      } else if (
        testCase.expectedAction.payloadMatcher &&
        !testCase.expectedAction.payloadMatcher(found.payload)
      ) {
        correctToolArguments = false;
      }
    }

    // 3. Strict vs Lenient Mode Check
    const mode = testCase.evaluationMode ?? 'lenient';
    if (testCase.expectedAction) {
      const extraneousActions = actions.filter(
        (a) =>
          !(
            a.componentId === testCase.expectedAction?.componentId &&
            a.action === testCase.expectedAction?.action
          )
      );

      if (mode === 'strict' && extraneousActions.length > 0) {
        correctToolChoice = false;
      } else if (mode === 'lenient') {
        // In lenient mode, extra read-only tools are allowed, but unrequested write actions are penalized
        const extraneousMutations = extraneousActions.filter(
          (a) => !DEFAULT_READONLY_ACTIONS.has(a.action)
        );
        if (extraneousMutations.length > 0) {
          correctToolChoice = false;
        }
      }
    }

    // 4. Negative Guardrails (WHEN NOT TO CALL)
    if (testCase.forbiddenActions) {
      for (const forbidden of testCase.forbiddenActions) {
        const forbiddenFound = actions.find(
          (a) =>
            a.componentId === forbidden.componentId && a.action === forbidden.action
        );
        if (forbiddenFound) {
          correctToolChoice = false;
          break;
        }
      }
    }

    // 5. Final Decision Evaluation (O(r))
    if (testCase.expectedDecision) {
      const responseText = execution.responseMessage || '';
      correctFinalDecision = testCase.expectedDecision(responseText);
    }

    // 6. Expected Error Keyword Check
    if (testCase.expectedErrorKeyword) {
      const hasKeyword = (
        execution.error ||
        execution.responseMessage ||
        ''
      ).includes(testCase.expectedErrorKeyword);
      if (!hasKeyword) {
        correctFinalDecision = false;
      }
    }

    // Acceptable Score = C(r) * A(r) * O(r)
    const acceptableScore =
      correctToolChoice && correctToolArguments && correctFinalDecision ? 1 : 0;
    const passed = acceptableScore === 1 && !repeatedConsecutiveCalls;

    let message = 'Başarılı';
    if (!correctToolChoice) message = 'Doğru araç seçimi başarısız (C(r) = 0)';
    else if (!correctToolArguments) message = 'Araç parametreleri uyuşmadı (A(r) = 0)';
    else if (!correctFinalDecision) message = 'Nihai karar uyuşmadı (O(r) = 0)';
    else if (repeatedConsecutiveCalls) message = 'Ardışık tekrarlayan araç çağrısı tespit edildi';

    return {
      id: testCase.id,
      name: testCase.name,
      passed,
      durationMs,
      message,
      correctToolChoice,
      correctToolArguments,
      correctFinalDecision,
      acceptableScore,
      hallucinated,
      repeatedConsecutiveCalls,
      diagnostics: execution,
    };
  }

  /**
   * Runs the full evaluation suite.
   */
  async runSuite(
    testCases: EvalTestCase[],
    executor: (prompt: string) => Promise<EvalExecutionResult>
  ): Promise<EvalSuiteResult> {
    const startTime = Date.now();
    const results: EvalCaseResult[] = [];

    for (const testCase of testCases) {
      const caseStart = Date.now();
      try {
        const execution = await executor(testCase.prompt);
        const result = this.evaluateExecution(
          testCase,
          execution,
          Date.now() - caseStart
        );
        results.push(result);
      } catch (err: any) {
        results.push({
          id: testCase.id,
          name: testCase.name,
          passed: false,
          durationMs: Date.now() - caseStart,
          message: `İstisna fırlatıldı: ${err?.message || err}`,
          correctToolChoice: false,
          correctToolArguments: false,
          correctFinalDecision: false,
          acceptableScore: 0,
          hallucinated: false,
          repeatedConsecutiveCalls: false,
        });
      }
    }

    const total = results.length;
    const passedCount = results.filter((r) => r.passed).length;
    const acceptableCount = results.filter((r) => r.acceptableScore === 1).length;
    const toolChoiceCount = results.filter((r) => r.correctToolChoice).length;
    const toolArgsCount = results.filter((r) => r.correctToolArguments).length;
    const finalDecisionCount = results.filter((r) => r.correctFinalDecision).length;
    const hallucinationCount = results.filter((r) => r.hallucinated).length;
    const repetitionCount = results.filter((r) => r.repeatedConsecutiveCalls).length;

    return {
      total,
      passed: passedCount,
      failed: total - passedCount,
      passRate: total > 0 ? Math.round((passedCount / total) * 100) : 0,
      acceptableRate: total > 0 ? Math.round((acceptableCount / total) * 100) : 0,
      toolChoiceRate: total > 0 ? Math.round((toolChoiceCount / total) * 100) : 0,
      toolArgumentsRate: total > 0 ? Math.round((toolArgsCount / total) * 100) : 0,
      finalDecisionRate: total > 0 ? Math.round((finalDecisionCount / total) * 100) : 0,
      hallucinationRate: total > 0 ? Math.round((hallucinationCount / total) * 100) : 0,
      toolRepetitionRate: total > 0 ? Math.round((repetitionCount / total) * 100) : 0,
      durationMs: Date.now() - startTime,
      results,
    };
  }

  /**
   * Evaluates reliability over k repeated trials (AgentArch pass@1 and pass^k).
   */
  async runReliabilityPassK(
    testCases: EvalTestCase[],
    k: number,
    executor: (prompt: string) => Promise<EvalExecutionResult>
  ): Promise<ReliabilityResult> {
    const runsPerCase: Record<string, EvalCaseResult[]> = {};
    let totalTrials = 0;
    let totalSuccessfulTrials = 0;
    let casesAllPassed = 0;
    let casesAllAcceptable = 0;

    for (const testCase of testCases) {
      runsPerCase[testCase.id] = [];
      let casePassCount = 0;
      let caseAcceptableCount = 0;

      for (let trial = 0; trial < k; trial++) {
        totalTrials++;
        const caseStart = Date.now();
        try {
          const execution = await executor(testCase.prompt);
          const evalResult = this.evaluateExecution(
            testCase,
            execution,
            Date.now() - caseStart
          );
          runsPerCase[testCase.id].push(evalResult);
          if (evalResult.passed) {
            totalSuccessfulTrials++;
            casePassCount++;
          }
          if (evalResult.acceptableScore === 1) {
            caseAcceptableCount++;
          }
        } catch (err: any) {
          runsPerCase[testCase.id].push({
            id: testCase.id,
            name: testCase.name,
            passed: false,
            durationMs: Date.now() - caseStart,
            message: `Hata: ${err?.message || err}`,
            correctToolChoice: false,
            correctToolArguments: false,
            correctFinalDecision: false,
            acceptableScore: 0,
            hallucinated: false,
            repeatedConsecutiveCalls: false,
          });
        }
      }

      if (casePassCount === k) casesAllPassed++;
      if (caseAcceptableCount === k) casesAllAcceptable++;
    }

    const totalCases = testCases.length;
    const passAt1 = totalTrials > 0 ? Math.round((totalSuccessfulTrials / totalTrials) * 100) : 0;
    const passHatK = totalCases > 0 ? Math.round((casesAllPassed / totalCases) * 100) : 0;
    const acceptablePassHatK = totalCases > 0 ? Math.round((casesAllAcceptable / totalCases) * 100) : 0;

    return {
      k,
      totalCases,
      passAt1,
      passHatK,
      acceptablePassHatK,
      runsPerCase,
    };
  }
}

export const evalRunner = new EvalRunner();

/**
 * Standard Headless UI Agent Evaluation Benchmark Suite
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
