/**
 * @file diagnostic-subagent.ts
 * Isolated Diagnostic Triage & Failure Analyst Sub-Agent.
 * Implements the Vercel AI SDK "Tool-as-a-Subagent" (Nested Worker) pattern.
 * Analyzes ambiguous or multi-factor failures without polluting Level-0 context
 * or exposing raw stack traces to the user.
 */

import { generateText } from "ai";
import { z } from "zod";
import {
  classifyDiagnosticError,
  type DiagnosticVerdict,
  type DiagnosticCategory,
  type DiagnosticAction,
} from "@my-agent/core";
import { getYulaLanguageModel } from "../yula-provider";
import { resolveProvider } from "../yula-config";

export const DIAGNOSTIC_VERDICT_SCHEMA = z.object({
  category: z.enum([
    "DATA_TYPE_MISMATCH",
    "COLUMN_NOT_FOUND",
    "SQL_SYNTAX_ERROR",
    "BUSINESS_RULE_VIOLATION",
    "TIMEOUT_EXCEEDED",
    "SYSTEM_ABORT",
    "PERMISSION_DENIED",
    "RESOURCE_UNAVAILABLE",
    "UNSPECIFIED",
  ]),
  isRecoverable: z.boolean(),
  action: z.enum(["SELF_HEAL", "ASK_USER_CHOICE", "HALT"]).optional(),
  confidence: z.number().optional().default(0.8),
  reason: z.string().optional(),
  userFriendlyExplanation: z.string().optional(),
  recoveryHint: z.string().optional(),
  suggestedChoices: z.array(z.string()).optional(),
});

export interface DiagnosticSubagentParams {
  error: unknown;
  payload?: unknown;
  componentId?: string;
  action?: string;
  correlationId?: string;
  topic?: string;
  provider?: string;
  baseUrl?: string;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 2500;

/**
 * Sanitizes and truncates error information to prevent multi-megabyte
 * stack traces from flooding sub-agent LLM prompts.
 */
function sanitizeErrorInfo(error: unknown): string {
  if (!error) return "Unknown Error";
  let raw = "";
  if (error instanceof Error) {
    raw = `${error.name}: ${error.message}\n${error.stack || ""}`;
  } else if (typeof error === "string") {
    raw = error;
  } else {
    try {
      raw = JSON.stringify(error, null, 2);
    } catch {
      raw = String(error);
    }
  }

  // Strip excessive file paths and node_modules bloat
  const cleaned = raw
    .split("\n")
    .filter((line) => !line.includes("node_modules/") && !line.includes("internal/"))
    .join("\n")
    .slice(0, 1200);

  return cleaned.trim();
}

/**
 * Executes the isolated Diagnostic Analyst Sub-Agent.
 * Pre-checks with Tier 1 deterministic classifier for zero token latency.
 * Falls back to deterministic triage if LLM times out or encounters network issues.
 */
export async function runDiagnosticSubagent(
  params: DiagnosticSubagentParams,
): Promise<DiagnosticVerdict> {
  const {
    error,
    payload,
    componentId,
    action,
    correlationId,
    topic,
    provider,
    baseUrl,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = params;

  // 1. Tier 1 Fast Pre-check: If deterministic classifier has high confidence, return immediately
  const deterministic = classifyDiagnosticError(error, {
    source: componentId,
    payload,
    topic,
    correlationId,
  });

  if (deterministic.confidence >= 0.85 && deterministic.category !== "UNKNOWN") {
    return deterministic;
  }

  // 2. Sub-Agent Execution with strict timeout guard
  const sanitizedError = sanitizeErrorInfo(error);
  const sanitizedPayload = payload ? JSON.stringify(payload).slice(0, 500) : "{}";

  try {
    const resolvedProvider = resolveProvider(provider);
    const model = getYulaLanguageModel(undefined, {
      provider: resolvedProvider,
      baseUrl,
    });

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`Diagnostic sub-agent timed out (${timeoutMs}ms)`)),
        timeoutMs,
      ),
    );

    const systemPrompt = `You are a Senior SRE and ERP Systems Failure Analyst sub-agent.
Your sole job is to diagnose enterprise UI/ERP tool and event failures.
Analyze the error and produce a strictly valid JSON object matching this schema:
{
  "category": "SYNTAX_OR_SCHEMA" | "BUSINESS_LOGIC" | "PERMISSIONS" | "INFRASTRUCTURE" | "DATA_NOT_FOUND" | "UNKNOWN",
  "isRecoverable": boolean,
  "action": "SELF_HEAL" | "ASK_USER_CHOICE" | "HALT",
  "confidence": number between 0 and 1,
  "reason": "Brief technical explanation in English",
  "userFriendlyExplanation": "Short, clear Turkish explanation for the user (1-2 sentences)",
  "recoveryHint": "Optional technical guidance for the calling agent if recoverable",
  "suggestedChoices": [
    {
      "label": "Button Title in Turkish",
      "description": "What will happen in Turkish",
      "rationale": "Why this option is suggested",
      "badge": "Optional 'Önerilen' badge"
    }
  ]
}

Rules:
1. If the error is an argument mismatch, bad date format, missing quote, or query typo that the AI can fix by correcting its tool call: set isRecoverable=true, action="SELF_HEAL".
2. If the error is a business constraint (closed period, record not found, unauthorized, invalid ERP ID): set isRecoverable=false, action="ASK_USER_CHOICE". Provide 2-3 interactive choices in suggestedChoices.
3. Output ONLY the raw JSON object. Do not include markdown codeblocks or commentary.`;

    const userPrompt = `Component: ${componentId || "system"}
Action: ${action || "RUN"}
Topic: ${topic || "general"}
Payload: ${sanitizedPayload}
Error:
${sanitizedError}`;

    const generatePromise = generateText({
      model,
      system: systemPrompt,
      prompt: userPrompt,
      temperature: 0.1,
    });

    const { text } = await Promise.race([generatePromise, timeoutPromise]);

    const cleanedText = text.replace(/```json/gi, "").replace(/```/g, "").trim();
    let rawObj: unknown = null;
    try {
      rawObj = JSON.parse(cleanedText);
    } catch {
      // ignore JSON syntax errors, will fallback to safeParse failure
    }
    const parsed = DIAGNOSTIC_VERDICT_SCHEMA.safeParse(rawObj);

    if (parsed.success) {
      const data = parsed.data;
      return {
        category: data.category as DiagnosticCategory,
        isRecoverable: data.isRecoverable,
        action: (data.action as DiagnosticAction) || (data.isRecoverable ? "SELF_HEAL" : "ASK_USER_CHOICE"),
        confidence: data.confidence ?? 0.8,
        reason: data.reason || sanitizedError,
        userFriendlyExplanation: data.userFriendlyExplanation || deterministic.userFriendlyExplanation,
        recoveryHint: data.recoveryHint,
        suggestedChoices: data.suggestedChoices || deterministic.suggestedChoices,
      };
    }
  } catch (subErr) {
    console.warn("[DiagnosticSubagent] Subagent analysis fallback:", (subErr as Error)?.message);
  }

  // 3. Deterministic Fallback
  return deterministic;
}
