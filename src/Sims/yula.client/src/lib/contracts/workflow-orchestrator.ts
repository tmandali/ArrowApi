/**
 * Workflow & Saga Orchestrator Contract & Engine
 * 
 * Implements the Enterprise Saga Pattern (Process Manager) for coordinating
 * multi-step business value streams across multiple Bounded Contexts.
 * 
 * Formula:
 * Workspace Orchestrator = Composite Workflow [BC_1 -> BC_2 -> ... -> BC_n]
 * 
 * Features:
 * - Deterministic sequential step execution
 * - Forward payload transformation and state aggregation
 * - Reverse compensating actions (rollback) on downstream failure
 * - Inline Human-in-the-Loop (HITL) suspension and resumption gateways
 * - LLM prompt formatting for agent grounding
 */

import { z } from "zod";
import type { SagaStrategy } from "./saga-strategy";
import { resolveSagaStrategy } from "./saga-strategy";

export * from "./saga-strategy";

// ---------------------------------------------------------------------------
// 1. Zod Schemas & Types
// ---------------------------------------------------------------------------

export const SagaStatusSchema = z.enum([
  "pending",
  "in_progress",
  "hitl_waiting",
  "completed",
  "compensating",
  "compensated",
  "failed",
]);
export type SagaStatus = z.infer<typeof SagaStatusSchema>;

export const CompensatingPolicySchema = z.enum([
  "rollback_all",
  "halt_and_notify",
  "best_effort",
]);
export type CompensatingPolicy = z.infer<typeof CompensatingPolicySchema>;

export interface HitlEvaluation {
  requiresHitl: boolean;
  reason?: string;
  prompt?: string;
}

export interface SagaExecutionContext {
  sagaId: string;
  runId: string;
  workspace: string;
  currentStepIndex: number;
  status: SagaStatus;
  state: Record<string, unknown>;
  results: Record<string, unknown>;
  completedSteps: string[];
  failedStep?: string;
  errors: Array<{ stepId: string; error: string }>;
  hitlCheckpoint?: {
    stepId: string;
    stepIndex: number;
    reason?: string;
    prompt?: string;
  };
  meta?: Record<string, unknown>;
}

export interface SagaStep<TPayload = any, TResult = any> {
  id: string;
  name: string;
  nameKey?: string;
  contextId: string;
  action: string;
  description?: string;
  payloadTransform?: (
    prevResult: any,
    accumulatedState: Record<string, unknown>,
    ctx: SagaExecutionContext,
  ) => TPayload;
  handler?: (
    payload: TPayload,
    ctx: SagaExecutionContext,
  ) => Promise<TResult> | TResult;
  compensate?: (
    stepOutput: TResult,
    accumulatedState: Record<string, unknown>,
    ctx: SagaExecutionContext,
  ) => Promise<unknown> | unknown;
  hitlCheck?: (
    stepOutput: TResult,
    accumulatedState: Record<string, unknown>,
    ctx: SagaExecutionContext,
  ) => HitlEvaluation | null | undefined;
}

export interface SagaDefinition {
  id: string;
  name: string;
  nameKey?: string;
  workspace: string;
  description: string;
  descriptionKey?: string;
  steps: SagaStep[];
  compensatingPolicy?: CompensatingPolicy;
  /**
   * Country / Channel Strategies (e.g. { TR: orderTrStrategy, DE: orderDeStrategy })
   */
  strategies?: Record<string, SagaStrategy>;
  meta?: Record<string, unknown>;
}

export interface SagaOrchestrator {
  id: string;
  name: string;
  workspace: string;
  sagas: Record<string, SagaDefinition>;
  meta?: Record<string, unknown>;
}

export interface SagaExecutionResult {
  runId: string;
  sagaId: string;
  status: SagaStatus;
  completedSteps: string[];
  failedStep?: string;
  results: Record<string, unknown>;
  finalState: Record<string, unknown>;
  errors: Array<{ stepId: string; error: string }>;
  hitlCheckpoint?: {
    stepId: string;
    stepIndex: number;
    reason?: string;
    prompt?: string;
  };
  suspensionContext?: SagaExecutionContext;
}

// ---------------------------------------------------------------------------
// 2. Factory Helper
// ---------------------------------------------------------------------------

export function defineSagaOrchestrator(orchestrator: SagaOrchestrator): SagaOrchestrator {
  return orchestrator;
}

export function defineSaga(saga: SagaDefinition): SagaDefinition {
  return saga;
}

// ---------------------------------------------------------------------------
// 3. Saga Execution Engine
// ---------------------------------------------------------------------------

/**
 * Executes a saga sequentially from start or from an existing suspension point.
 */
export async function executeSaga(
  saga: SagaDefinition,
  initialPayload: Record<string, unknown> = {},
  options?: {
    runId?: string;
    countryCode?: string;
    channel?: string;
    meta?: Record<string, unknown>;
    resumeFromContext?: SagaExecutionContext;
  },
): Promise<SagaExecutionResult> {
  const effectiveSaga = options?.countryCode
    ? resolveSagaStrategy(saga, options.countryCode, options.channel)
    : saga;

  const runId =
    options?.runId || options?.resumeFromContext?.runId || `saga-run-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  // Restore existing execution context or initialize fresh one
  const ctx: SagaExecutionContext = options?.resumeFromContext
    ? {
        ...options.resumeFromContext,
        status: "in_progress",
      }
    : {
        sagaId: effectiveSaga.id,
        runId,
        workspace: effectiveSaga.workspace,
        currentStepIndex: 0,
        status: "in_progress",
        state: { ...initialPayload },
        results: {},
        completedSteps: [],
        errors: [],
        meta: options?.meta || {},
      };

  let lastStepResult: unknown = initialPayload;

  // Step loop
  for (let i = ctx.currentStepIndex; i < effectiveSaga.steps.length; i++) {
    const step = effectiveSaga.steps[i];
    ctx.currentStepIndex = i;

    // 1. Transform Payload
    let stepInput = lastStepResult;
    if (step.payloadTransform) {
      try {
        stepInput = step.payloadTransform(lastStepResult, ctx.state, ctx);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        ctx.errors.push({ stepId: step.id, error: `Payload transform failed: ${errorMsg}` });
        return await handleSagaFailure(effectiveSaga, ctx, step.id);
      }
    }

    // 2. Execute Step Handler
    let stepOutput: unknown;
    try {
      if (step.handler) {
        stepOutput = await step.handler(stepInput, ctx);
      } else {
        // Fallback simulated execution when handler is delegated to dispatch bridge
        stepOutput = { executed: true, stepId: step.id, input: stepInput };
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      ctx.errors.push({ stepId: step.id, error: errorMsg });
      return await handleSagaFailure(effectiveSaga, ctx, step.id);
    }

    // Record step completion
    ctx.completedSteps.push(step.id);
    ctx.results[step.id] = stepOutput;
    ctx.state[step.id] = stepOutput;
    lastStepResult = stepOutput;

    // 3. Check for Human-In-The-Loop (HITL) Gate
    if (step.hitlCheck) {
      try {
        const hitl = step.hitlCheck(stepOutput, ctx.state, ctx);
        if (hitl && hitl.requiresHitl) {
          ctx.status = "hitl_waiting";
          ctx.hitlCheckpoint = {
            stepId: step.id,
            stepIndex: i + 1, // Next step to resume at
            reason: hitl.reason,
            prompt: hitl.prompt,
          };
          return {
            runId: ctx.runId,
            sagaId: ctx.sagaId,
            status: "hitl_waiting",
            completedSteps: ctx.completedSteps,
            results: ctx.results,
            finalState: ctx.state,
            errors: ctx.errors,
            hitlCheckpoint: ctx.hitlCheckpoint,
            suspensionContext: { ...ctx, currentStepIndex: i + 1 },
          };
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        ctx.errors.push({ stepId: step.id, error: `HITL check error: ${errorMsg}` });
        return await handleSagaFailure(effectiveSaga, ctx, step.id);
      }
    }
  }

  ctx.status = "completed";
  return {
    runId: ctx.runId,
    sagaId: ctx.sagaId,
    status: "completed",
    completedSteps: ctx.completedSteps,
    results: ctx.results,
    finalState: ctx.state,
    errors: ctx.errors,
  };
}

/**
 * Resumes a suspended HITL saga based on user decision.
 */
export async function resumeSaga(
  saga: SagaDefinition,
  suspendedContext: SagaExecutionContext,
  decision: { approved: boolean; feedback?: string },
): Promise<SagaExecutionResult> {
  if (!decision.approved) {
    suspendedContext.errors.push({
      stepId: suspendedContext.hitlCheckpoint?.stepId || "hitl_rejected",
      error: decision.feedback || "Action rejected by user during HITL checkpoint",
    });
    return await handleSagaFailure(saga, suspendedContext, suspendedContext.hitlCheckpoint?.stepId || "hitl");
  }

  // Clear HITL checkpoint and resume execution
  const resumeCtx: SagaExecutionContext = {
    ...suspendedContext,
    hitlCheckpoint: undefined,
  };

  return await executeSaga(saga, resumeCtx.state, { resumeFromContext: resumeCtx });
}

/**
 * Handles rollback/compensation of completed steps in reverse order.
 */
async function handleSagaFailure(
  saga: SagaDefinition,
  ctx: SagaExecutionContext,
  failedStepId: string,
): Promise<SagaExecutionResult> {
  ctx.failedStep = failedStepId;
  const policy = saga.compensatingPolicy || "rollback_all";

  if (policy === "halt_and_notify") {
    ctx.status = "failed";
    return {
      runId: ctx.runId,
      sagaId: ctx.sagaId,
      status: "failed",
      completedSteps: ctx.completedSteps,
      failedStep: failedStepId,
      results: ctx.results,
      finalState: ctx.state,
      errors: ctx.errors,
    };
  }

  ctx.status = "compensating";

  // Reverse iterate through completed steps
  const stepsToCompensate = [...ctx.completedSteps].reverse();
  for (const stepId of stepsToCompensate) {
    const stepDef = saga.steps.find((s) => s.id === stepId);
    if (stepDef && stepDef.compensate) {
      try {
        const stepOutput = ctx.results[stepId];
        await stepDef.compensate(stepOutput, ctx.state, ctx);
      } catch (compErr) {
        const compMsg = compErr instanceof Error ? compErr.message : String(compErr);
        ctx.errors.push({
          stepId,
          error: `Compensation failed: ${compMsg}`,
        });
        if (policy === "rollback_all") {
          ctx.status = "failed";
        }
      }
    }
  }

  ctx.status = ctx.status === "failed" ? "failed" : "compensated";
  return {
    runId: ctx.runId,
    sagaId: ctx.sagaId,
    status: ctx.status,
    completedSteps: ctx.completedSteps,
    failedStep: failedStepId,
    results: ctx.results,
    finalState: ctx.state,
    errors: ctx.errors,
  };
}

// ---------------------------------------------------------------------------
// 4. LLM Agent Prompt Formatter
// ---------------------------------------------------------------------------

/**
 * Formats a Saga definition into Markdown guidelines for LLM agent grounding.
 */
export function formatSagaPrompt(
  saga: SagaDefinition,
  t?: (key: string) => string,
  countryCode?: string,
  channel?: string,
): string {
  const effectiveSaga = countryCode ? resolveSagaStrategy(saga, countryCode, channel) : saga;
  const title = t && effectiveSaga.nameKey ? t(effectiveSaga.nameKey) : effectiveSaga.name;
  const description = t && effectiveSaga.descriptionKey ? t(effectiveSaga.descriptionKey) : effectiveSaga.description;

  const lines: string[] = [
    `### Workflow Saga: ${title} (\`${effectiveSaga.id}\`)`,
    `> **Workspace:** \`${effectiveSaga.workspace}\``,
    `> **Description:** ${description}`,
    `> **Compensation Policy:** \`${effectiveSaga.compensatingPolicy || "rollback_all"}\``,
  ];

  if (effectiveSaga.meta?.resolvedCountryCode) {
    lines.push(`> **Jurisdiction Strategy:** \`${effectiveSaga.meta.resolvedCountryCode}\``);
  }

  lines.push("", "#### Execution Pipeline:");

  effectiveSaga.steps.forEach((step, idx) => {
    const stepName = t && step.nameKey ? t(step.nameKey) : step.name;
    const hasComp = step.compensate ? " [↩️ Compensable]" : "";
    const hasHitl = step.hitlCheck ? " [🛑 HITL Gate]" : "";
    lines.push(
      `${idx + 1}. **${stepName}** (\`${step.id}\`)${hasComp}${hasHitl}`,
      `   - Context: \`${step.contextId}\` | Action: \`${step.action}\``,
    );
  });

  return lines.join("\n");
}
