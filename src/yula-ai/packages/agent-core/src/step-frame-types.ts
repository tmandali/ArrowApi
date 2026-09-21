/**
 * Causal Step Frame & Turn State Machine Types
 * Reference: reference-pi/packages/agent/src/types.ts and Vercel AI SDK onStepFinish
 */

export type AgentTurnStateStatus =
  | 'idle'
  | 'thinking'
  | 'tool_dispatching'
  | 'tool_executing'
  | 'tool_evaluating'
  | 'recovering'
  | 'suspended'
  | 'completed'
  | 'aborted';

export type AgentTurnState =
  | { status: 'idle' }
  | { status: 'thinking'; stepIndex: number; rationale?: string }
  | { status: 'tool_dispatching'; stepIndex: number; tool: string; input: unknown }
  | { status: 'tool_executing'; stepIndex: number; tool: string; startedAt: number }
  | { status: 'tool_evaluating'; stepIndex: number; tool: string; output: unknown; isError: boolean }
  | { status: 'recovering'; stepIndex: number; failedTool: string; error: string; attempt: number }
  | { status: 'suspended'; stepIndex: number; reason: 'choice' | 'confirmation' | 'stagnation'; prompt: string }
  | { status: 'completed'; summary?: string }
  | { status: 'aborted'; reason: string };

export type StepFrameStatus = 'running' | 'success' | 'error' | 'recovered' | 'interrupted';

/**
 * First-class ReAct Step Frame unit.
 * Captures Thought (Reasoning) + Action (Tool) + Observation (Result/Error) + Causal Transition.
 */
export interface AgentStepFrame {
  id: string;
  conversationId: string;
  stepIndex: number;
  parentStepId?: string;
  status: StepFrameStatus;

  // ReAct Triad
  thought?: string;
  actionTool?: string;
  actionInput?: unknown;
  observation?: unknown;

  isError?: boolean;
  errorMessage?: string;
  transitionReason?: string;
  durationMs?: number;
  startedAt?: number;
  completedAt?: number;
}

/**
 * Semantic roles for text emitted during an Agent ReAct turn.
 * Replaces generic 'text' with actionable semantic classification.
 */
export type TextPartRole =
  | 'plan_rationale'   // Pre-action evaluation, plan, and criteria rationale
  | 'decision_prompt'  // Leading question/prompt for ask_user_choice or confirmation
  | 'progress_notice'  // Status line (e.g. "📊 Retail Sales Report started...", "🚀 Opening page...")
  | 'final_synthesis'; // Final business answer, analysis, and summary

export interface SemanticTextPart {
  type: 'text';
  role: TextPartRole;
  text: string;
}

/**
 * Type guard ensuring a part is a valid text part.
 */
export function isTextPart(
  part: unknown,
): part is { type: 'text'; text: string; role?: TextPartRole } {
  return (
    typeof part === 'object' &&
    part !== null &&
    (part as { type?: unknown }).type === 'text' &&
    typeof (part as { text?: unknown }).text === 'string'
  );
}

/**
 * Type guard ensuring a part is a reasoning / thought part.
 */
export function isReasoningPart(
  part: unknown,
): part is { type: 'reasoning'; text: string; meta?: string } {
  return (
    typeof part === 'object' &&
    part !== null &&
    (part as { type?: unknown }).type === 'reasoning' &&
    typeof (part as { text?: unknown }).text === 'string'
  );
}

/**
 * Classifies raw LLM text into its semantic role within an agent turn purely based
 * on structural execution context (pre-action rationale vs final synthesis).
 * Zero regex, zero emoji matching, zero natural language dependency.
 */
export function classifyTextPart(
  text: string,
  hasToolsInMessage = false,
): TextPartRole {
  const trimmed = text.trim();
  if (!trimmed) return 'final_synthesis';

  // Any text emitted alongside or preceding tool execution is a pre-action plan/rationale
  if (hasToolsInMessage) {
    return 'plan_rationale';
  }

  // Without tool executions, text is the user-facing final synthesized answer
  return 'final_synthesis';
}

/**
 * Safely extracts all concatenated text from a message's parts.
 * Optionally filter by specific semantic roles.
 */
export function getMessageText(
  message?: { parts?: unknown[] },
  options?: { roles?: TextPartRole[]; excludeRoles?: TextPartRole[] },
): string {
  if (!message?.parts || !Array.isArray(message.parts)) return '';
  return message.parts
    .filter(isTextPart)
    .filter((p) => {
      if (options?.roles && p.role && !options.roles.includes(p.role)) return false;
      if (options?.excludeRoles && p.role && options.excludeRoles.includes(p.role)) return false;
      return true;
    })
    .map((p) => p.text.trim())
    .filter(Boolean)
    .join('\n');
}
