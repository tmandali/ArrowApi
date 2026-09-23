/**
 * Jurisdiction Strategy Pattern for Bounded Contexts
 * 
 * Implements the architectural principle:
 * Effective Context = Base Context ⊕ Country Strategy(countryCode)
 * 
 * Enables multi-country operations (e.g. TR: GİB E-İrsaliye vs. DE: GoBD/XRechnung)
 * on the SAME universal menu item without creating separate menus.
 */

import { z } from "zod";
import type { ActionContract, EventContract } from "@my-agent/core";
import type {
  BoundedContextContract,
  BoundedStateField,
  BoundedStateDefinition,
  BoundedProcessDefinition,
  BoundedProcessTransition,
} from "./bounded-context";

// ---------------------------------------------------------------------------
// 1. Zod Schemas & Types
// ---------------------------------------------------------------------------

export const JurisdictionStrategySchema = z.object({
  countryCode: z.string().min(2).max(3),
  stateAugmentation: z
    .object({
      fields: z.record(z.string(), z.any()).optional(),
      businessRules: z.array(z.string()).optional(),
      businessRuleKeys: z.array(z.string()).optional(),
      schema: z.custom<z.ZodTypeAny>().optional(),
    })
    .optional(),
  processAugmentation: z
    .object({
      additionalStatuses: z.record(z.string(), z.string()).optional(),
      statusKeys: z.record(z.string(), z.string()).optional(),
      additionalTransitions: z.array(z.any()).optional(),
      businessRules: z.array(z.string()).optional(),
      businessRuleKeys: z.array(z.string()).optional(),
    })
    .optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
});

export interface JurisdictionStrategy<TState = any> {
  countryCode: "TR" | "DE" | "US" | string;
  stateAugmentation?: {
    fields?: Record<string, BoundedStateField>;
    businessRules?: string[];
    businessRuleKeys?: string[];
    schema?: z.ZodType<Partial<TState>>;
  };
  processAugmentation?: {
    additionalStatuses?: Record<string, string>;
    statusKeys?: Record<string, string>;
    additionalTransitions?: BoundedProcessTransition[];
    businessRules?: string[];
    businessRuleKeys?: string[];
  };
  meta?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// 2. Factory & Runtime Resolver Helpers
// ---------------------------------------------------------------------------

export function defineJurisdictionStrategy<TState = any>(
  strategy: JurisdictionStrategy<TState>,
): JurisdictionStrategy<TState> {
  if (process.env.NODE_ENV !== "production") {
    JurisdictionStrategySchema.safeParse(strategy);
  }
  return strategy;
}

/**
 * Merges a base BoundedContextContract with a specific country's JurisdictionStrategy.
 * Formula: Effective Context = Base Context ⊕ Country Strategy(countryCode)
 */
export function resolveContextStrategy<
  TState = Record<string, unknown>,
  TActions extends Record<string, ActionContract> = Record<string, ActionContract>,
  TEvents extends Record<string, EventContract> = Record<string, EventContract>,
>(
  baseContext: BoundedContextContract<TState, TActions, TEvents>,
  countryCode?: string,
): BoundedContextContract<TState, TActions, TEvents> {
  if (!countryCode || !baseContext.strategies || !baseContext.strategies[countryCode]) {
    return baseContext;
  }

  const strategy = baseContext.strategies[countryCode];
  const stateAug = strategy.stateAugmentation;
  const procAug = strategy.processAugmentation;

  // 1. Merge Bounded State
  const mergedFields = {
    ...(baseContext.state.fields || {}),
    ...(stateAug?.fields || {}),
  };
  const mergedRules = [
    ...(baseContext.state.businessRules || []),
    ...(stateAug?.businessRules || []),
  ];
  const mergedRuleKeys = [
    ...(baseContext.state.businessRuleKeys || []),
    ...(stateAug?.businessRuleKeys || []),
  ];

  const effectiveState: BoundedStateDefinition<TState> = {
    ...baseContext.state,
    fields: mergedFields,
    businessRules: mergedRules.length > 0 ? mergedRules : undefined,
    businessRuleKeys: mergedRuleKeys.length > 0 ? mergedRuleKeys : undefined,
  };

  // 2. Merge Bounded Process (if base process exists or strategy adds one)
  let effectiveProcess: BoundedProcessDefinition | undefined = baseContext.process;
  if (baseContext.process || procAug) {
    const baseProc = baseContext.process || {
      flowName: `${baseContext.title} Lifecycle`,
      initialState: "draft",
      statuses: {},
      transitions: [],
    };

    effectiveProcess = {
      ...baseProc,
      statuses: {
        ...baseProc.statuses,
        ...(procAug?.additionalStatuses || {}),
      },
      statusKeys: {
        ...(baseProc.statusKeys || {}),
        ...(procAug?.statusKeys || {}),
      },
      transitions: (() => {
        const additionalTrans = procAug?.additionalTransitions || [];
        const overriddenKeys = new Set(additionalTrans.map((t) => `${t.from}->${t.to}`));
        return [
          ...baseProc.transitions.filter((t) => !overriddenKeys.has(`${t.from}->${t.to}`)),
          ...additionalTrans,
        ];
      })(),
      businessRules: [
        ...(baseProc.businessRules || []),
        ...(procAug?.businessRules || []),
      ],
      businessRuleKeys: [
        ...(baseProc.businessRuleKeys || []),
        ...(procAug?.businessRuleKeys || []),
      ],
    };
  }

  const resolved = {
    ...baseContext,
    meta: {
      ...baseContext.meta,
      resolvedJurisdiction: countryCode,
    },
    state: effectiveState,
    process: effectiveProcess,
  };

  if (resolved.screen) {
    Object.defineProperty(resolved.screen, "boundedContext", {
      value: resolved,
      enumerable: false,
      configurable: true,
      writable: true,
    });
  }

  return resolved;
}
