import type { ZodTypeAny } from 'zod';

export interface StorageAdapter {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
  clear?: () => void;
}

export interface Tool<TInput = any, TOutput = any> {
  description: string;
  parameters?: any;
  inputSchema?: ZodTypeAny | any;
  execute: (input: TInput) => Promise<TOutput>;
}

export function tool<TInput = any, TOutput = any>(def: Tool<TInput, TOutput>): Tool<TInput, TOutput> {
  return def;
}

export interface ActionCondition {
  phase?: 'workspace' | 'results' | string;
  route?: string;
  requiresMounted?: boolean;
  predicate?: (context: any) => boolean;
}

export interface ActionContract<TInputSchema extends ZodTypeAny = ZodTypeAny, TOutputSchema extends ZodTypeAny = ZodTypeAny> {
  description?: string;
  /** Girdi şeması (Modelin göndereceği payload parametreleri) */
  inputSchema?: TInputSchema;
  /** Geriye dönük uyumluluk takma adı (inputSchema ile eşdeğerdir) */
  schema?: TInputSchema;
  /** Çıktı şeması (Aksiyon çalıştığında dönen sonucun sözleşmesi) */
  outputSchema?: TOutputSchema;
  /** Modelin bu aksiyonu tetiklemesi GEREKEN durumlar (LLM prompt rehberi) */
  whenToCall: string;
  /** Modelin bu aksiyonu ASLA tetiklememesi gereken durumlar (LLM prompt rehberi) */
  whenNotToCall: string;
  /** Deterministik motor doğrulama kuralları (Preflight & Router kuralı) */
  when?: ActionCondition;
}

export interface EventContract<TSchema extends ZodTypeAny = ZodTypeAny> {
  description: string;
  schema: TSchema;
}

export interface ComponentSchema {
  id: string;
  capabilities?: string[];
  meta?: Record<string, any>;
  executionMode?: 'parallel' | 'sequential';
  actions?: Record<string, ActionContract>;
  events?: Record<string, EventContract>;
}

export interface RecordTelemetryOptions {
  /** Milisaniye cinsinden tekilleştirme penceresi (varsayılan: 250ms) */
  dedupWindowMs?: number;
  /** Aynı source ve type ile gelen ardışık olayların son kaydını yerinde güncelleme (varsayılan: true) */
  coalesce?: boolean;
  /** Tekilleştirme ve birleştirmeyi atlayıp olayı doğrudan yeni kayıt olarak ekleme */
  force?: boolean;
}

export interface IEventBus {
  subscribe(componentId: string, handler: (action: string, payload: any) => any): () => void;
  dispatch(actionPayload: UIAction): { success: boolean; result?: any; error?: string };
  recordTelemetry(event: Omit<UIEvent, 'timestamp'>, options?: RecordTelemetryOptions): void;
  getRecentEvents(): UIEvent[];
  clear(): void;
}

export interface IComponentRegistry {
  register(schema: ComponentSchema): void;
  unregister(componentId: string, schema?: ComponentSchema): void;
  get(componentId: string): ComponentSchema | undefined;
  getActiveComponents(): ComponentSchema[];
  preflightValidate(componentId: string, action: string, payload?: any, context?: any): PreflightValidationResult;
  postflightValidate(componentId: string, action: string, output?: any): { valid: boolean; error?: string };
  formatActiveComponentsPrompt(components?: ComponentSchema[]): string;
  clear(): void;
}

export interface UIEvent {
  source: string;
  type: string;
  payload?: any;
  timestamp: number;
}

export interface UIAction {
  component_id: string;
  action: string;
  payload?: any;
}

export interface UIContextSnapshot {
  route: string;
  active_components: ComponentSchema[];
  recent_events: UIEvent[];
}

/**
 * Pi-Style Effect Gate and Lifecycle Types
 * Reference: earendil-works/pi/packages/agent/src/harness/execution/effect-gate.ts
 */
export interface Gate {
  readonly signal: AbortSignal;
  admit<T>(invoke: () => T): T;
}

export interface GateControl {
  beginAbort(cancellation: Promise<void>): void;
  signalAbort(): void;
  close(error: Error): void;
}

export interface PreflightValidationResult {
  valid: boolean;
  error?: string;
  component?: ComponentSchema;
}

/**
 * Pi Agent Lifecycle Event Types
 * Reference: earendil-works/pi/packages/agent/src/types.ts (lines 448-463)
 */
export type AgentEvent =
  // Agent lifecycle
  | { type: 'agent_start'; prompt?: string; timestamp?: number }
  | { type: 'agent_end'; messages?: any[]; timestamp?: number }
  // Turn lifecycle - a turn is one assistant response + any tool calls/results
  | { type: 'turn_start'; turnIndex?: number; timestamp?: number }
  | { type: 'turn_end'; message?: any; toolResults?: any[]; timestamp?: number }
  // Message lifecycle - emitted for system, user, assistant, and toolResult messages
  | { type: 'message_start'; message: { role: string; content?: any; [key: string]: any }; timestamp?: number }
  // Only emitted for assistant messages during streaming
  | { type: 'message_update'; chunk?: string; fullContent?: string; timestamp?: number }
  | { type: 'message_end'; message: { role: string; content?: any; [key: string]: any }; timestamp?: number }
  // Tool execution lifecycle
  | { type: 'tool_execution_start'; toolCallId: string; toolName: string; args: any; timestamp?: number }
  | { type: 'tool_execution_update'; toolCallId: string; toolName: string; args: any; partialResult?: any; timestamp?: number }
  | { type: 'tool_execution_end'; toolCallId: string; toolName: string; result: any; isError: boolean; timestamp?: number }
  // Pi Advanced: Steering, Branch & Telemetry events
  | { type: 'steer_injected'; message: string; timestamp?: number }
  | { type: 'follow_up_queued'; message: string; timestamp?: number }
  | { type: 'session_checkpoint'; id: string; label: string; timestamp?: number }
  | { type: 'telemetry_metric'; metric: TelemetryMetric; timestamp?: number }
  | { type: 'route_changed'; from: string; to: string; reason?: string; timestamp?: number }
  // Pi Advanced Part 2: Progress, Lanes, Deferred, Replay, Reconcile
  | { type: 'tool_progress'; toolCallId: string; toolName: string; percentage: number; message: string; data?: any; timestamp?: number }
  | { type: 'lane_switched'; lane: string; reason?: string; timestamp?: number }
    | { type: 'task_suspended'; taskId: string; handleId: string; metadata?: any; timestamp?: number }
  | { type: 'task_resumed'; taskId: string; handleId: string; result?: any; timestamp?: number }
  | { type: 'task_timed_out'; taskId: string; handleId: string; metadata?: any; timestamp?: number }
  | { type: 'task_cancelled'; taskId: string; handleId: string; reason?: string; timestamp?: number }
  | { type: 'session_replayed'; fromSeq: number; toSeq: number; timestamp?: number }
  | { type: 'reconcile_completed'; recoveredCount: number; message: string; timestamp?: number }
  | { type: 'user_choice_prompt'; question: string; options: any[]; allow_custom?: boolean; timestamp?: number }
  | { type: 'compaction_start'; reason: 'threshold' | 'overflow' | 'manual'; tokensBefore: number; timestamp?: number }
  | { type: 'compaction_end'; reason: 'threshold' | 'overflow' | 'manual'; tokensBefore: number; tokensAfter: number; summary: string; timestamp?: number }
  | { type: 'tool_loadout_updated'; added: string[]; removed: string[]; timestamp?: number };

/** 1. beforeToolCall & afterToolCall Hook Types (Pi) */
export interface BeforeToolCallContext {
  toolName: string;
  toolCallId: string;
  args: any;
  activeComponents: ComponentSchema[];
}

export interface BeforeToolCallResult {
  block?: { reason: string; terminate?: boolean };
  args?: any;
}

export interface AfterToolCallContext {
  toolName: string;
  toolCallId: string;
  args: any;
  result: any;
  isError: boolean;
}

export interface AfterToolCallResult {
  result?: any;
  details?: Record<string, any>;
  isError?: boolean;
  terminate?: boolean;
}

export type BeforeToolCallHook = (context: BeforeToolCallContext) => Promise<BeforeToolCallResult | void> | BeforeToolCallResult | void;
export type AfterToolCallHook = (context: AfterToolCallContext) => Promise<AfterToolCallResult | void> | AfterToolCallResult | void;

/** 2. Steering & Follow-up Queue Types (Pi) */
export interface QueueItem {
  id: string;
  content: string;
  role: 'user' | 'system';
  timestamp: number;
}

/** 3. Execution Mode Types (Pi) */
export type ExecutionMode = 'parallel' | 'sequential';

/** 5. Session Branching & Undo/Redo Types (Pi) */
export interface SessionCheckpoint {
  id: string;
  label: string;
  timestamp: number;
  snapshot: {
    route: string;
    stage?: string;
    state: Record<string, any>;
    events: UIEvent[];
  };
}

export interface SessionBranch {
  id: string;
  name: string;
  createdAt: number;
  checkpoints: SessionCheckpoint[];
  currentIndex: number;
}

/** 7. Telemetry & Metrics Types (Pi) */
export interface TelemetryMetric {
  turnIndex: number;
  durationMs: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  toolsExecutedCount: number;
  toolsSuccessRate: number;
}

/** 8. Context Window & Compaction Types (Pi Reference) */
export interface ContextUsage {
  tokens: number;
  contextWindow: number;
  percent: number;
}

export interface CompactionSettings {
  enabled: boolean;
  reserveTokens: number;
  keepRecentTokens: number;
}

export interface CompactionResult {
  summary: string;
  tokensBefore: number;
  estimatedTokensAfter: number;
  compactedMessagesCount: number;
  keptMessagesCount: number;
}

