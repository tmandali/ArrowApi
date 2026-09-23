"use client";

import { useMemo, useCallback } from "react";
import type {
  BoundedContextContract,
} from "@/lib/contracts/bounded-context";
import { resolveContextStrategy } from "@/lib/contracts/jurisdiction-strategy";
import { validateAggregateInvariants } from "@/lib/contracts/aggregate-root";

export interface UseEffectiveBoundedContextOptions {
  /** Optional country override (e.g. "TR", "DE"); defaults to "TR" if not provided */
  countryCode?: string;
}

/**
 * Headless Hook: Resolves the Effective Bounded Context dynamically based on jurisdiction.
 * 
 * Formula: Effective Context = Base Context ⊕ Country Strategy(countryCode)
 * 
 * Guarantees zero `if (country === ...)` in UI view components.
 */
export function useEffectiveBoundedContext<TState = Record<string, unknown>>(
  baseContext: BoundedContextContract<TState, any, any>,
  options?: UseEffectiveBoundedContextOptions,
) {
  const countryCode = options?.countryCode || "TR";

  const effectiveContext = useMemo(() => {
    return resolveContextStrategy(baseContext, countryCode);
  }, [baseContext, countryCode]);

  const fields = useMemo(() => {
    return effectiveContext.state.fields || {};
  }, [effectiveContext]);

  const process = effectiveContext.process;

  /**
   * Helper to validate aggregate invariants for header and children lines.
   */
  const checkInvariants = useCallback(
    (rootData: any, childrenData: any) => {
      const aggregate = (effectiveContext.state as any)?.aggregateRoot;
      if (!aggregate) {
        return { valid: true, errors: [] };
      }
      return validateAggregateInvariants(aggregate, rootData, childrenData);
    },
    [effectiveContext]
  );

  return {
    effectiveContext,
    countryCode,
    fields,
    process,
    checkInvariants,
  };
}
