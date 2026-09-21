import { eq, asc } from "drizzle-orm";
import { createDbConnection } from "./connection";
import { agentRunsSchema, agentStepsSchema } from "./schema";
import type { AgentStepFrame } from "@my-agent/core";
import { extractToolErrorMessage } from "@/lib/yula-tool-info";

/**
 * Server-side PostgreSQL service for recording ReAct Step Frames
 * and reconstructing the Causal Decision Tree.
 */
export class AgentTelemetryService {
  private static dbPromise: Promise<Awaited<ReturnType<typeof createDbConnection>> | null> | null = null;

  private static async getDb() {
    if (!this.dbPromise) {
      this.dbPromise = createDbConnection().catch((err) => {
        console.warn("[AgentTelemetryService] DB connection failed:", err.message);
        this.dbPromise = null;
        return null;
      });
    }
    return this.dbPromise;
  }

  /**
   * Initializes or updates an agent run record.
   */
  static async ensureRun(runId: string, conversationId: string): Promise<void> {
    try {
      const db = await this.getDb();
      if (!db) return;

      await db
        .insert(agentRunsSchema)
        .values({
          id: runId,
          conversationId,
          status: "in_progress",
        })
        .onConflictDoNothing();
    } catch (error) {
      console.warn("[AgentTelemetryService] ensureRun warning:", error);
    }
  }

  /**
   * Durably saves a completed ReAct Step Frame to PostgreSQL.
   */
  static async recordStep(runId: string, step: AgentStepFrame): Promise<void> {
    try {
      const db = await this.getDb();
      if (!db) return;

      await this.ensureRun(runId, step.conversationId);

      await db
        .insert(agentStepsSchema)
        .values({
          id: step.id,
          runId,
          conversationId: step.conversationId,
          stepIndex: step.stepIndex,
          parentStepId: step.parentStepId ?? null,
          status: step.status,
          thought: step.thought ?? null,
          toolName: step.actionTool ?? null,
          toolInput: step.actionInput ?? null,
          toolOutput: step.observation ?? null,
          errorMessage: step.errorMessage ?? null,
          transitionReason: step.transitionReason ?? null,
          durationMs: step.durationMs ?? 0,
        })
        .onConflictDoUpdate({
          target: agentStepsSchema.id,
          set: {
            status: step.status,
            thought: step.thought ?? null,
            toolName: step.actionTool ?? null,
            toolInput: step.actionInput ?? null,
            toolOutput: step.observation ?? null,
            errorMessage: step.errorMessage ?? null,
            transitionReason: step.transitionReason ?? null,
            durationMs: step.durationMs ?? 0,
          },
        });
    } catch (error) {
      console.warn("[AgentTelemetryService] recordStep warning:", error);
    }
  }

  /**
   * Marks a run as completed, errored, or aborted.
   */
  static async completeRun(
    runId: string,
    meta: {
      status?: "completed" | "error" | "aborted";
      totalSteps?: number;
      totalDurationMs?: number;
      totalTokens?: number;
    }
  ): Promise<void> {
    try {
      const db = await this.getDb();
      if (!db) return;

      await db
        .update(agentRunsSchema)
        .set({
          status: meta.status ?? "completed",
          totalSteps: meta.totalSteps ?? 0,
          totalDurationMs: meta.totalDurationMs ?? 0,
          totalTokens: meta.totalTokens ?? 0,
          updatedAt: new Date(),
        })
        .where(eq(agentRunsSchema.id, runId));
    } catch (error) {
      console.warn("[AgentTelemetryService] completeRun warning:", error);
    }
  }

  /**
   * Retrieves all step frames for a conversation ordered chronologically
   * to rebuild the causal decision tree.
   */
  static async getDecisionTree(conversationId: string): Promise<AgentStepFrame[]> {
    try {
      const db = await this.getDb();
      if (!db) return [];

      const rows = await db
        .select()
        .from(agentStepsSchema)
        .where(eq(agentStepsSchema.conversationId, conversationId))
        .orderBy(asc(agentStepsSchema.stepIndex), asc(agentStepsSchema.createdAt));

      return rows.map((r) => ({
        id: r.id,
        conversationId: r.conversationId,
        stepIndex: r.stepIndex,
        parentStepId: r.parentStepId ?? undefined,
        status: r.status as AgentStepFrame["status"],
        thought: r.thought ?? undefined,
        actionTool: r.toolName ?? undefined,
        actionInput: r.toolInput,
        observation: r.toolOutput,
        isError: r.status === "error" || Boolean(r.errorMessage),
        errorMessage: r.errorMessage ?? undefined,
        transitionReason: r.transitionReason ?? undefined,
        durationMs: r.durationMs ?? 0,
        startedAt: r.createdAt ? r.createdAt.getTime() : undefined,
      }));
    } catch (error) {
      console.warn("[AgentTelemetryService] getDecisionTree warning:", error);
      return [];
    }
  }
}

/**
 * Creates an in-flight run recorder for Vercel AI SDK onStepFinish & onFinish callbacks.
 */
export function createRunRecorder(runId: string, conversationId: string) {
  let stepIndex = 0;
  let previousStepId: string | undefined = undefined;
  let previousHadError = false;

  return {
    async onStepFinish(step: {
      text?: string;
      toolCalls?: unknown[];
      toolResults?: unknown[];
      finishReason?: string;
    }) {
      stepIndex += 1;
      const currentStepId = `${runId}-step-${stepIndex}`;

      const calls = Array.isArray(step.toolCalls) ? step.toolCalls : [];
      const results = Array.isArray(step.toolResults) ? step.toolResults : [];

      const firstCall = calls[0] as Record<string, unknown> | undefined;
      const firstResult = results[0] as Record<string, unknown> | undefined;

      const toolName = firstCall ? String(firstCall.toolName || firstCall.name || "") : undefined;
      const toolInput = firstCall ? (firstCall.args ?? firstCall.input) : undefined;
      const toolOutput = firstResult ? (firstResult.result ?? firstResult.output) : undefined;

      const errMsg = extractToolErrorMessage(toolOutput);
      const isError = Boolean(errMsg);

      let transitionReason: string | undefined = undefined;
      if (previousHadError) {
        transitionReason = "Hata sonrası telafi/kurtarma adımı";
      }

      const frame: AgentStepFrame = {
        id: currentStepId,
        conversationId,
        stepIndex: stepIndex - 1,
        parentStepId: previousStepId,
        status: isError ? "error" : previousHadError ? "recovered" : "success",
        thought: step.text ? step.text.trim() : undefined,
        actionTool: toolName,
        actionInput: toolInput,
        observation: toolOutput,
        isError,
        errorMessage: errMsg || undefined,
        transitionReason,
      };

      previousStepId = currentStepId;
      previousHadError = isError;

      await AgentTelemetryService.recordStep(runId, frame);
    },

    async onFinish(meta: { finishReason?: string; totalTokens?: number }) {
      await AgentTelemetryService.completeRun(runId, {
        status: meta.finishReason === "error" ? "error" : "completed",
        totalSteps: stepIndex,
        totalTokens: meta.totalTokens ?? 0,
      });
    },
  };
}
