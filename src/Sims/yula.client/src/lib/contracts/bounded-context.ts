/**
 * Bounded Context Contract Definition
 * 
 * Implements the architectural principle:
 * Bounded Context = Bounded State + Bounded Process
 * 
 * Each menu item in a workspace maps 1:1 to a Bounded Context.
 * Fully supports runtime Zod validation and next-intl localization.
 */

import { z } from "zod";
import type { ActionContract, EventContract } from "@my-agent/core";
import type { ScreenContract } from "./screen-contract";
import type { JurisdictionStrategy } from "./jurisdiction-strategy";

export * from "./jurisdiction-strategy";
export * from "./aggregate-root";

// ---------------------------------------------------------------------------
// 1. Zod Runtime Schemas with Localization Keys
// ---------------------------------------------------------------------------

export const BoundedContextTypeSchema = z.enum([
  "masterdata",
  "transactional",
  "analytical",
]);

export type BoundedContextType = z.infer<typeof BoundedContextTypeSchema>;

export const BoundedStateFieldSchema = z.object({
  name: z.string().optional(),
  label: z.string().optional(),
  labelKey: z.string().optional(),
  type: z
    .enum(["string", "number", "boolean", "date", "enum", "relation"])
    .optional(),
  description: z.string(),
  descriptionKey: z.string().optional(),
  aliases: z.array(z.string()).optional(),
  aliasesKey: z.string().optional(),
  enumValues: z
    .array(
      z.object({
        code: z.string(),
        label: z.string(),
        labelKey: z.string().optional(),
        meaning: z.string().optional(),
      }),
    )
    .optional(),
});

export type BoundedStateField = z.infer<typeof BoundedStateFieldSchema>;

export const BoundedStateDefinitionSchema = z.object({
  entityName: z.string(),
  description: z.string(),
  descriptionKey: z.string().optional(),
  fields: z.record(z.string(), z.union([BoundedStateFieldSchema, z.string()])).optional(),
  businessRules: z.array(z.string()).optional(),
  businessRuleKeys: z.array(z.string()).optional(),
  schema: z.custom<z.ZodTypeAny>().optional(),
  aggregateRoot: z.custom<any>().optional(),
});

export interface BoundedStateDefinition<TState = Record<string, unknown>> {
  entityName: string;
  description: string;
  descriptionKey?: string;
  fields?: Record<string, BoundedStateField | string>;
  businessRules?: string[];
  businessRuleKeys?: string[];
  initialState?: Partial<TState>;
  /** Optional Zod schema validating the live form/state */
  schema?: z.ZodType<TState>;
  /** Optional Aggregate Root definition linking Header, Children, and Invariants */
  aggregateRoot?: any;
}

export const BoundedProcessTransitionSchema = z.object({
  from: z.string(),
  to: z.string(),
  label: z.string().optional(),
  labelKey: z.string().optional(),
  guard: z.string().optional(),
  action: z.string().optional(),
});

export type BoundedProcessTransition = z.infer<typeof BoundedProcessTransitionSchema>;

export const BoundedProcessDefinitionSchema = z.object({
  flowName: z.string(),
  flowNameKey: z.string().optional(),
  initialState: z.string(),
  terminalStates: z.array(z.string()).optional(),
  statuses: z.record(z.string(), z.string()),
  statusKeys: z.record(z.string(), z.string()).optional(),
  transitions: z.array(BoundedProcessTransitionSchema),
  businessRules: z.array(z.string()).optional(),
  businessRuleKeys: z.array(z.string()).optional(),
});

export type BoundedProcessDefinition = z.infer<typeof BoundedProcessDefinitionSchema>;

export const BoundedContextContractSchema = z.object({
  id: z.string(),
  title: z.string(),
  titleKey: z.string().optional(),
  workspace: z.string(),
  type: BoundedContextTypeSchema,
  partyReferenceKey: z.string().optional(),
  /**
   * next-intl translation namespace (e.g. "BoundedContext.StockItem").
   */
  i18nNamespace: z.string().optional(),
  state: BoundedStateDefinitionSchema,
  process: BoundedProcessDefinitionSchema.optional(),
  strategies: z.record(z.string(), z.any()).optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
});

export interface BoundedContextContract<
  TState = Record<string, unknown>,
  TActions extends Record<string, ActionContract> = Record<string, ActionContract>,
  TEvents extends Record<string, EventContract> = Record<string, EventContract>,
> {
  id: string;
  title: string;
  titleKey?: string;
  workspace: string;
  type: BoundedContextType;
  /**
   * Reference key linking to Legal Entity / Party (e.g. "partyId", "supplierId").
   */
  partyReferenceKey?: string;
  /**
   * next-intl translation namespace (e.g. "BoundedContext.StockItem").
   */
  i18nNamespace?: string;
  state: BoundedStateDefinition<TState>;
  process?: BoundedProcessDefinition;
  /**
   * Country / Jurisdiction Strategies (e.g. { TR: deliveryNoteTrStrategy, DE: deliveryNoteDeStrategy }).
   * Dynamically resolved at runtime based on active session company country.
   */
  strategies?: Record<string, JurisdictionStrategy<TState>>;
  screen?: ScreenContract<TActions, TEvents>;
  meta?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// 2. Factory & Validator Helpers
// ---------------------------------------------------------------------------

export function defineBoundedContext<
  TState = Record<string, unknown>,
  TActions extends Record<string, ActionContract> = Record<string, ActionContract>,
  TEvents extends Record<string, EventContract> = Record<string, EventContract>,
>(
  contract: BoundedContextContract<TState, TActions, TEvents>,
): BoundedContextContract<TState, TActions, TEvents> {
  if (process.env.NODE_ENV !== "production") {
    BoundedContextContractSchema.safeParse({
      id: contract.id,
      title: contract.title,
      titleKey: contract.titleKey,
      workspace: contract.workspace,
      type: contract.type,
      partyReferenceKey: contract.partyReferenceKey,
      i18nNamespace: contract.i18nNamespace,
      state: contract.state,
      process: contract.process,
      meta: contract.meta,
    });
  }

  if (contract.screen) {
    Object.defineProperty(contract.screen, "boundedContext", {
      value: contract,
      enumerable: false,
      configurable: true,
      writable: true,
    });
  }

  return contract;
}

// ---------------------------------------------------------------------------
// 3. Deterministic State Machine & Transition Engine (LLM Guardrails)
// ---------------------------------------------------------------------------

export interface TransitionValidationResult {
  valid: boolean;
  error?: string;
  allowedTransitions?: string[];
}

export type TranslationFn = (
  key: string,
  values?: Record<string, string | number>,
) => string;

/**
 * Checks whether a state transition is allowed in the process lifecycle.
 */
export function canTransition(
  process: BoundedProcessDefinition | undefined,
  fromStatus: string,
  toStatus: string,
): boolean {
  if (!process) return true;
  return process.transitions.some((t) => t.from === fromStatus && t.to === toStatus);
}

/**
 * Validates a transition and returns structured feedback for the agent.
 * Optionally localizes error messages via next-intl translation function `t`.
 */
export function validateTransition(
  process: BoundedProcessDefinition | undefined,
  fromStatus: string,
  toStatus: string,
  t?: TranslationFn,
): TransitionValidationResult {
  if (!process) {
    return { valid: true };
  }
  const allowed = process.transitions
    .filter((t) => t.from === fromStatus)
    .map((t) => t.to);

  if (!allowed.includes(toStatus)) {
    const statusLabels = process.statuses;
    const fromLabel = statusLabels[fromStatus] || fromStatus;
    const toLabel = statusLabels[toStatus] || toStatus;
    const allowedLabels =
      allowed.map((s) => statusLabels[s] || s).join(", ") || "Yok (Terminal durum)";

    let error = `Geçersiz durum geçişi: '${fromLabel}' (${fromStatus}) durumundan doğrudan '${toLabel}' (${toStatus}) durumuna geçilemez. Geçerli sıradaki adımlar: [${allowedLabels}].`;
    if (t) {
      try {
        const localized = t("BoundedContext.Process.invalid_transition", {
          from: fromLabel,
          to: toLabel,
          allowed: allowedLabels,
        });
        if (localized) error = localized;
      } catch {
        // Fall back to default error string
      }
    }

    return {
      valid: false,
      error,
      allowedTransitions: allowed,
    };
  }

  return { valid: true, allowedTransitions: allowed };
}

/**
 * Asserts that a transition is valid; throws a descriptive Error if invalid.
 */
export function assertTransition(
  process: BoundedProcessDefinition | undefined,
  fromStatus: string,
  toStatus: string,
  t?: TranslationFn,
): void {
  const result = validateTransition(process, fromStatus, toStatus, t);
  if (!result.valid) {
    throw new Error(result.error);
  }
}

// ---------------------------------------------------------------------------
// 4. LLM System Prompt Serializer with Dynamic Localization
// ---------------------------------------------------------------------------

/**
 * Formats a Bounded Context into grounding markdown for the LLM system prompt.
 * If translation function `t` is passed and `i18nNamespace` is set, resolves
 * title, descriptions, field aliases, and status labels in the user's active locale.
 */
export function formatBoundedContextPrompt(
  context?: BoundedContextContract<any, any, any>,
  t?: TranslationFn,
): string {
  if (!context) return "";

  const ns = context.i18nNamespace ? `${context.i18nNamespace}.` : "";
  const translate = (key?: string, fallback?: string): string => {
    if (!key) return fallback || "";
    if (!t) return fallback || key;
    try {
      const fullKey = ns && !key.startsWith(ns) ? `${ns}${key}` : key;
      const res = t(fullKey);
      return res || fallback || key;
    } catch {
      return fallback || key;
    }
  };

  const title = translate(context.titleKey, context.title);
  const entityDesc = translate(
    context.state.descriptionKey,
    context.state.description,
  );

  const lines: string[] = [];
  lines.push(
    `<active_bounded_context id="${context.id}" workspace="${context.workspace}" type="${context.type}">`,
  );
  lines.push(`  Title: ${title}`);
  lines.push(`  Entity: ${context.state.entityName} - ${entityDesc}`);

  if (context.state.fields && Object.keys(context.state.fields).length > 0) {
    lines.push("  Key Attributes:");
    for (const [key, field] of Object.entries(context.state.fields)) {
      if (typeof field === "string") {
        lines.push(`    - ${key}: ${field}`);
      } else {
        const typeStr = field.type ? ` (${field.type})` : "";
        const desc = translate(field.descriptionKey, field.description);

        let aliases = field.aliases;
        if (field.aliasesKey && t) {
          const rawAliases = translate(field.aliasesKey, "");
          if (rawAliases) {
            aliases = rawAliases.split(",").map((s) => s.trim());
          }
        }
        const aliasStr = aliases?.length ? ` [aka: ${aliases.join(", ")}]` : "";
        lines.push(`    - ${key}${typeStr}: ${desc}${aliasStr}`);

        if (field.enumValues?.length) {
          const enumDesc = field.enumValues
            .map((e) => {
              const label = translate(e.labelKey, e.label);
              return `${e.code}: ${label}`;
            })
            .join(", ");
          lines.push(`      Allowed values: [${enumDesc}]`);
        }
      }
    }
  }

  const rules = context.state.businessRules || [];
  if (rules.length > 0) {
    lines.push("  State Business Rules:");
    for (const rule of rules) {
      lines.push(`    * ${rule}`);
    }
  }

  if (context.state.aggregateRoot?.children) {
    lines.push("  Child Collections (Lines / Detail Entities):");
    for (const [childKey, childDef] of Object.entries(context.state.aggregateRoot.children as Record<string, any>)) {
      const minText = childDef.minCount !== undefined ? ` (min: ${childDef.minCount})` : "";
      lines.push(`    - ${childKey} -> ${childDef.entityName}${minText}: ${childDef.description}`);
    }
  }

  if (context.process) {
    const flowName = translate(
      context.process.flowNameKey,
      context.process.flowName,
    );
    lines.push(`  Process Lifecycle: ${flowName}`);
    lines.push(`  Initial Status: ${context.process.initialState}`);
    if (context.process.statuses) {
      const statusList = Object.entries(context.process.statuses)
        .map(([code, fallbackLabel]) => {
          const key = context.process?.statusKeys?.[code];
          const label = translate(key, fallbackLabel);
          return `${code} (${label})`;
        })
        .join(" -> ");
      lines.push(`  Statuses: ${statusList}`);
    }
    if (context.process.transitions?.length) {
      lines.push("  Valid Transitions:");
      for (const t of context.process.transitions) {
        const guardStr = t.guard ? ` [guard: ${t.guard}]` : "";
        lines.push(`    * ${t.from} -> ${t.to}${guardStr}`);
      }
    }
    if (context.process.businessRules?.length) {
      lines.push("  Process Rules:");
      for (const rule of context.process.businessRules) {
        lines.push(`    * ${rule}`);
      }
    }
  }

  lines.push("</active_bounded_context>");
  return lines.join("\n");
}
