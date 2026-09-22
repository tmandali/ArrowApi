import type { EvalSuiteResult, EvalCaseResult } from './evals';

export type EvalLiftStatus = 'improved' | 'regressed' | 'stable-passed' | 'stable-failed';

export type EvalLiftFlag =
  | 'positive-lift'
  | 'no-lift'
  | 'negative-delta'
  | 'control-saturated'
  | 'treatment-saturated'
  | 'flaky';

export interface EvalCaseLiftComparison {
  id: string;
  name: string;
  controlPassed: boolean;
  treatmentPassed: boolean;
  controlAcceptableScore: number;
  treatmentAcceptableScore: number;
  status: EvalLiftStatus;
  notes?: string;
}

export interface EvalLiftComparison {
  totalCases: number;
  controlPassRate: number;
  treatmentPassRate: number;
  liftRate: number;
  acceptableLiftRate: number;
  controlDurationMs: number;
  treatmentDurationMs: number;
  durationDeltaMs: number;
  flags: EvalLiftFlag[];
  cases: EvalCaseLiftComparison[];
  improvedCount: number;
  regressedCount: number;
  stablePassedCount: number;
  stableFailedCount: number;
}

/**
 * Computes comparative lift between Control (e.g. without playbook/guidelines)
 * and Treatment (e.g. with grounded rules & safety guardrails).
 * Reference: Reference-Pi Eval Comparison Engine (report.ts)
 */
export function computeEvalLift(
  controlResult: EvalSuiteResult,
  treatmentResult: EvalSuiteResult
): EvalLiftComparison {
  const controlMap = new Map<string, EvalCaseResult>();
  for (const r of controlResult.results) {
    controlMap.set(r.id, r);
  }

  const cases: EvalCaseLiftComparison[] = [];
  let improvedCount = 0;
  let regressedCount = 0;
  let stablePassedCount = 0;
  let stableFailedCount = 0;

  for (const tCase of treatmentResult.results) {
    const cCase = controlMap.get(tCase.id);
    const controlPassed = cCase ? cCase.passed : false;
    const treatmentPassed = tCase.passed;
    const controlAcceptableScore = cCase ? cCase.acceptableScore : 0;
    const treatmentAcceptableScore = tCase.acceptableScore;

    let status: EvalLiftStatus;
    if (!controlPassed && treatmentPassed) {
      status = 'improved';
      improvedCount++;
    } else if (controlPassed && !treatmentPassed) {
      status = 'regressed';
      regressedCount++;
    } else if (controlPassed && treatmentPassed) {
      status = 'stable-passed';
      stablePassedCount++;
    } else {
      status = 'stable-failed';
      stableFailedCount++;
    }

    cases.push({
      id: tCase.id,
      name: tCase.name,
      controlPassed,
      treatmentPassed,
      controlAcceptableScore,
      treatmentAcceptableScore,
      status,
      notes:
        status === 'improved'
          ? 'Kurumsal kural / güvenlik bariyeri sayesinde başarıya ulaştı'
          : status === 'regressed'
            ? 'Regresyon tespit edildi'
            : undefined,
    });
  }

  const liftRate = treatmentResult.passRate - controlResult.passRate;
  const acceptableLiftRate = treatmentResult.acceptableRate - controlResult.acceptableRate;
  const durationDeltaMs = treatmentResult.durationMs - controlResult.durationMs;

  const flags: EvalLiftFlag[] = [];
  if (controlResult.passRate === 100 && treatmentResult.passRate === 100) {
    flags.push('control-saturated', 'treatment-saturated', 'no-lift');
  } else {
    if (liftRate > 0) flags.push('positive-lift');
    else if (liftRate === 0) flags.push('no-lift');
    else flags.push('negative-delta');

    if (treatmentResult.passRate === 100) {
      flags.push('treatment-saturated');
    }
  }

  return {
    totalCases: cases.length,
    controlPassRate: controlResult.passRate,
    treatmentPassRate: treatmentResult.passRate,
    liftRate,
    acceptableLiftRate,
    controlDurationMs: controlResult.durationMs,
    treatmentDurationMs: treatmentResult.durationMs,
    durationDeltaMs,
    flags,
    cases,
    improvedCount,
    regressedCount,
    stablePassedCount,
    stableFailedCount,
  };
}
