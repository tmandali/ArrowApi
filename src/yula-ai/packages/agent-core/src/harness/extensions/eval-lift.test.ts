import { describe, it, expect } from 'vitest';
import { computeEvalLift } from './eval-lift';
import type { EvalSuiteResult, EvalCaseResult } from './evals';

function createMockCase(id: string, name: string, passed: boolean, acceptableScore = passed ? 1 : 0): EvalCaseResult {
  return {
    id,
    name,
    passed,
    durationMs: 10,
    message: passed ? 'Başarılı' : 'Hata',
    correctToolChoice: passed,
    correctToolArguments: passed,
    correctFinalDecision: passed,
    acceptableScore,
    hallucinated: false,
    repeatedConsecutiveCalls: false,
  };
}

function createMockSuite(results: EvalCaseResult[], durationMs = 100): EvalSuiteResult {
  const passed = results.filter((r) => r.passed).length;
  const acceptable = results.filter((r) => r.acceptableScore === 1).length;
  const total = results.length;
  const passRate = total > 0 ? Math.round((passed / total) * 100) : 0;
  const acceptableRate = total > 0 ? Math.round((acceptable / total) * 100) : 0;

  return {
    total,
    passed,
    failed: total - passed,
    passRate,
    acceptableRate,
    toolChoiceRate: passRate,
    toolArgumentsRate: passRate,
    finalDecisionRate: passRate,
    hallucinationRate: 0,
    toolRepetitionRate: 0,
    durationMs,
    results,
  };
}

describe('Eval Lift & Comparative Analysis Engine', () => {
  it('computes positive lift when treatment outperforms control due to rules/guardrails', () => {
    const controlCases = [
      createMockCase('c1', 'PO Oluşturma', true),
      createMockCase('c2', 'Yıkıcı SQL Engelleme', false), // Failed in control
      createMockCase('c3', 'Yetersiz Stok Bariyeri', false), // Failed in control
      createMockCase('c4', 'DuckDB Analitik', true),
    ];
    const treatmentCases = [
      createMockCase('c1', 'PO Oluşturma', true),
      createMockCase('c2', 'Yıkıcı SQL Engelleme', true), // Improved!
      createMockCase('c3', 'Yetersiz Stok Bariyeri', true), // Improved!
      createMockCase('c4', 'DuckDB Analitik', true),
    ];

    const controlSuite = createMockSuite(controlCases, 50);
    const treatmentSuite = createMockSuite(treatmentCases, 60);

    const comparison = computeEvalLift(controlSuite, treatmentSuite);

    expect(comparison.totalCases).toBe(4);
    expect(comparison.controlPassRate).toBe(50);
    expect(comparison.treatmentPassRate).toBe(100);
    expect(comparison.liftRate).toBe(50); // +50% lift
    expect(comparison.improvedCount).toBe(2);
    expect(comparison.regressedCount).toBe(0);
    expect(comparison.stablePassedCount).toBe(2);
    expect(comparison.flags).toContain('positive-lift');
    expect(comparison.flags).toContain('treatment-saturated');

    const improved = comparison.cases.filter((c) => c.status === 'improved');
    expect(improved.map((c) => c.id)).toEqual(['c2', 'c3']);
  });

  it('detects regression when treatment introduces failure', () => {
    const controlCases = [createMockCase('c1', 'Arama', true)];
    const treatmentCases = [createMockCase('c1', 'Arama', false)];

    const comparison = computeEvalLift(
      createMockSuite(controlCases),
      createMockSuite(treatmentCases)
    );

    expect(comparison.liftRate).toBe(-100);
    expect(comparison.regressedCount).toBe(1);
    expect(comparison.flags).toContain('negative-delta');
  });

  it('handles saturated suites where both pass 100%', () => {
    const cases = [createMockCase('c1', 'Test', true)];

    const comparison = computeEvalLift(
      createMockSuite(cases),
      createMockSuite(cases)
    );

    expect(comparison.liftRate).toBe(0);
    expect(comparison.flags).toContain('control-saturated');
    expect(comparison.flags).toContain('treatment-saturated');
    expect(comparison.flags).toContain('no-lift');
  });
});
