/**
 * Saga Strategy Pattern for Workflow Orchestrators
 * 
 * Implements the architectural principle:
 * Effective Saga = Base Saga ⊕ Country Strategy(countryCode, channel)
 * 
 * Enables dynamic injection of jurisdiction-specific steps
 * (e.g. TR: GİB E-İrsaliye signing vs. DE: VIES VAT validation)
 * and strategy-specific state augmentation without pipeline duplication.
 */

import type { z } from "zod";
import type { SagaDefinition, SagaStep } from "./workflow-orchestrator";

// ---------------------------------------------------------------------------
// 1. Types & Interfaces
// ---------------------------------------------------------------------------

export interface SagaStepInsertion {
  /** Step ID after which the new step should be inserted */
  insertAfter?: string;
  /** Step ID before which the new step should be inserted */
  insertBefore?: string;
  /** The step definition to inject */
  step: SagaStep;
}

export interface SagaStrategy<TState = Record<string, unknown>> {
  countryCode: string;
  channel?: string;
  description?: string;
  /**
   * Overrides base steps by step ID (overwrites action, handler, compensate, or hitlCheck).
   */
  stepOverrides?: Record<string, Partial<SagaStep>>;
  /**
   * Step IDs to remove from the base pipeline for this strategy.
   */
  removeSteps?: string[];
  /** Additional steps injected dynamically into the pipeline */
  additionalSteps?: SagaStepInsertion[];
  /** Strategy-specific state extensions */
  stateAugmentation?: {
    initialState?: Partial<TState>;
    validationSchema?: z.ZodType<any>;
  };
}

// ---------------------------------------------------------------------------
// 2. Factory Helper
// ---------------------------------------------------------------------------

export function defineSagaStrategy<TState = Record<string, unknown>>(
  strategy: SagaStrategy<TState>,
): SagaStrategy<TState> {
  return strategy;
}

// ---------------------------------------------------------------------------
// 3. Strategy Resolver Engine
// ---------------------------------------------------------------------------

/**
 * Resolves an effective Saga by merging a base SagaDefinition with a country/channel strategy.
 * Formula: Effective Saga = Base Saga ⊕ Strategy(countryCode, channel)
 */
export function resolveSagaStrategy(
  baseSaga: SagaDefinition,
  countryCode?: string,
  channel?: string,
): SagaDefinition {
  if (!countryCode || !baseSaga.strategies) {
    return baseSaga;
  }

  // 1. Lookup specific compound key `${countryCode}:${channel}` first, then fallback to `${countryCode}`
  const compoundKey = channel ? `${countryCode}:${channel}` : undefined;
  const strategy =
    (compoundKey && baseSaga.strategies[compoundKey]) ||
    baseSaga.strategies[countryCode];

  if (!strategy) {
    return baseSaga;
  }

  // 2. Clone steps and apply removals if requested
  let effectiveSteps = [...baseSaga.steps];
  if (strategy.removeSteps && strategy.removeSteps.length > 0) {
    const removeSet = new Set(strategy.removeSteps);
    effectiveSteps = effectiveSteps.filter((s) => !removeSet.has(s.id));
  }

  // 3. Apply Step Overrides (base adımı ezme)
  if (strategy.stepOverrides) {
    for (let i = 0; i < effectiveSteps.length; i++) {
      const stepId = effectiveSteps[i].id;
      if (strategy.stepOverrides[stepId]) {
        effectiveSteps[i] = {
          ...effectiveSteps[i],
          ...strategy.stepOverrides[stepId],
        };
      }
    }
  }

  // 4. Inject Additional Steps
  if (strategy.additionalSteps && strategy.additionalSteps.length > 0) {
    for (const insertion of strategy.additionalSteps) {
      if (insertion.insertAfter) {
        const targetIdx = effectiveSteps.findIndex((s) => s.id === insertion.insertAfter);
        if (targetIdx !== -1) {
          effectiveSteps.splice(targetIdx + 1, 0, insertion.step);
          continue;
        }
      }

      if (insertion.insertBefore) {
        const targetIdx = effectiveSteps.findIndex((s) => s.id === insertion.insertBefore);
        if (targetIdx !== -1) {
          effectiveSteps.splice(targetIdx, 0, insertion.step);
          continue;
        }
      }

      // Default: Append step to the end if no anchor matched
      effectiveSteps.push(insertion.step);
    }
  }

  return {
    ...baseSaga,
    steps: effectiveSteps,
    meta: {
      ...baseSaga.meta,
      resolvedCountryCode: countryCode,
      resolvedChannel: channel,
      strategyApplied: true,
      strategyDescription: strategy.description,
    },
  };
}
