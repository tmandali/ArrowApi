/**
 * Aggregate Root & Invariant Contract
 * 
 * Formalizes Domain-Driven Design (DDD) Aggregates for transactional
 * enterprise documents (e.g. SalesOrder, SalesInvoice, DeliveryNote).
 * 
 * Key Principles:
 * 1. Root Entity (Header): Gateway entity through which all access passes.
 * 2. Child Entities (Lines / Collections): Sub-entities (e.g. items, taxes).
 * 3. Invariants: Business rules protecting transactional consistency
 *    (e.g. "grand_total must equal sum of line amounts + taxes", "min 1 item").
 */

import { z } from "zod";
import type { BoundedStateField, BoundedStateDefinition } from "./bounded-context";

// ---------------------------------------------------------------------------
// 1. Zod Runtime Schemas & Types
// ---------------------------------------------------------------------------

export const ChildEntityDefinitionSchema = z.object({
  entityName: z.string(),
  description: z.string(),
  descriptionKey: z.string().optional(),
  minCount: z.number().int().nonnegative().optional(),
  maxCount: z.number().int().positive().optional(),
  fields: z.record(z.string(), z.any()),
});
export type ChildEntityDefinition = z.infer<typeof ChildEntityDefinitionSchema> & {
  fields: Record<string, BoundedStateField>;
};

export interface AggregateInvariant<TRoot = any, TChildren = any> {
  id: string;
  description: string;
  descriptionKey?: string;
  validate: (
    root: TRoot,
    children: TChildren,
  ) => boolean | { valid: boolean; message?: string };
}

export interface AggregateRootDefinition<
  TRoot = Record<string, unknown>,
  TChildren = Record<string, any[]>,
> {
  name: string;
  description: string;
  descriptionKey?: string;
  /**
   * Root Entity (Header / Document level)
   */
  root: {
    fields: Record<string, BoundedStateField>;
    validationSchema?: z.ZodType<TRoot>;
  };
  /**
   * Child Entities (Lines, Grid rows, Tax breakdowns)
   */
  children?: Record<string, ChildEntityDefinition>;
  /**
   * Aggregate Invariant Rules (Consistency boundaries)
   */
  invariants?: AggregateInvariant<TRoot, TChildren>[];
  businessRules?: string[];
  businessRuleKeys?: string[];
}

export interface InvariantValidationResult {
  valid: boolean;
  errors: string[];
}

// ---------------------------------------------------------------------------
// 2. Factory Helper
// ---------------------------------------------------------------------------

export function defineAggregateRoot<
  TRoot = Record<string, unknown>,
  TChildren = Record<string, any[]>,
>(
  definition: AggregateRootDefinition<TRoot, TChildren>,
): AggregateRootDefinition<TRoot, TChildren> {
  return definition;
}

// ---------------------------------------------------------------------------
// 3. Invariant Validation Engine
// ---------------------------------------------------------------------------

/**
 * Validates aggregate invariants and child cardinality constraints.
 */
export function validateAggregateInvariants<
  TRoot = Record<string, unknown>,
  TChildren extends Record<string, any[]> = Record<string, any[]>,
>(
  aggregate: AggregateRootDefinition<TRoot, TChildren>,
  rootData: TRoot,
  childrenData: TChildren = {} as TChildren,
): InvariantValidationResult {
  const errors: string[] = [];

  // 1. Cardinality checks on child entities
  if (aggregate.children) {
    for (const [childKey, childDef] of Object.entries(aggregate.children)) {
      const collection = childrenData[childKey] || [];
      if (childDef.minCount !== undefined && collection.length < childDef.minCount) {
        errors.push(
          `Child entity '${childDef.entityName}' (${childKey}) requires at least ${childDef.minCount} item(s), but found ${collection.length}.`,
        );
      }
      if (childDef.maxCount !== undefined && collection.length > childDef.maxCount) {
        errors.push(
          `Child entity '${childDef.entityName}' (${childKey}) exceeds maximum allowed count of ${childDef.maxCount} (found ${collection.length}).`,
        );
      }
    }
  }

  // 2. Invariant rule execution
  if (aggregate.invariants) {
    for (const inv of aggregate.invariants) {
      try {
        const result = inv.validate(rootData, childrenData);
        if (typeof result === "boolean") {
          if (!result) {
            errors.push(`Invariant violated [${inv.id}]: ${inv.description}`);
          }
        } else if (!result.valid) {
          errors.push(
            result.message || `Invariant violated [${inv.id}]: ${inv.description}`,
          );
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`Invariant execution error [${inv.id}]: ${msg}`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// ---------------------------------------------------------------------------
// 4. Prompt Formatter & Bounded State Adapter
// ---------------------------------------------------------------------------

/**
 * Formats an Aggregate Root into Markdown guidelines for LLM agent grounding.
 */
export function formatAggregateRootPrompt(
  aggregate: AggregateRootDefinition,
  t?: (key: string) => string,
): string {
  const desc = t && aggregate.descriptionKey ? t(aggregate.descriptionKey) : aggregate.description;
  const lines: string[] = [
    `### Aggregate Root: ${aggregate.name}`,
    `> **Role:** ${desc}`,
    "",
    "#### 👑 Root Entity (Header):",
  ];

  for (const [fieldName, field] of Object.entries(aggregate.root.fields)) {
    const fieldObj = typeof field === "string" ? { description: field } : field;
    const fieldDesc = t && fieldObj.descriptionKey ? t(fieldObj.descriptionKey) : fieldObj.description;
    const aliases = fieldObj.aliases?.length ? ` (aliases: ${fieldObj.aliases.join(", ")})` : "";
    lines.push(`- \`${fieldName}\` [${fieldObj.type || "string"}]: ${fieldDesc}${aliases}`);
  }

  if (aggregate.children && Object.keys(aggregate.children).length > 0) {
    lines.push("", "#### 📋 Child Collections (Lines / Details):");
    for (const [childKey, childDef] of Object.entries(aggregate.children)) {
      const minText = childDef.minCount !== undefined ? ` (min: ${childDef.minCount})` : "";
      lines.push(`- **\`${childKey}\`** -> \`${childDef.entityName}\`${minText}: ${childDef.description}`);
      for (const [subName, subField] of Object.entries(childDef.fields)) {
        const subObj = typeof subField === "string" ? { description: subField } : subField;
        lines.push(`  * \`${subName}\` [${subObj.type || "string"}]: ${subObj.description}`);
      }
    }
  }

  if (aggregate.invariants && aggregate.invariants.length > 0) {
    lines.push("", "#### 🛡️ Invariant Rules (Consistency Constraints):");
    for (const inv of aggregate.invariants) {
      const invDesc = t && inv.descriptionKey ? t(inv.descriptionKey) : inv.description;
      lines.push(`- **[${inv.id}]**: ${invDesc}`);
    }
  }

  return lines.join("\n");
}

/**
 * Converts an AggregateRootDefinition into a BoundedStateDefinition for BoundedContextContract integration.
 */
export function toBoundedStateDefinition<
  TRoot = Record<string, unknown>,
  TChildren = any,
>(
  aggregate: AggregateRootDefinition<TRoot, TChildren>,
): BoundedStateDefinition<TRoot> {
  const businessRules = [
    ...(aggregate.businessRules || []),
    ...(aggregate.invariants?.map((inv) => `[Invariant ${inv.id}]: ${inv.description}`) || []),
  ];

  return {
    entityName: aggregate.name,
    description: aggregate.description,
    descriptionKey: aggregate.descriptionKey,
    fields: aggregate.root.fields,
    businessRules: businessRules.length > 0 ? businessRules : undefined,
    businessRuleKeys: aggregate.businessRuleKeys,
    schema: aggregate.root.validationSchema,
    aggregateRoot: aggregate,
  };
}
