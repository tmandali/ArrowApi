/**
 * Autonomous Agent Loop Types
 * Reference: reference-pi/packages/agent/src/types.ts
 */

export type ToolExecutionMode = 'sequential' | 'parallel';
export type QueueMode = 'all' | 'one-at-a-time';
export type ThinkingLevel = 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export interface AgentToolCall {
  id: string;
  name: string;
  arguments: Record<string, any>;
}

export interface AgentToolResult<T = any> {
  content: Array<{ type: string; text?: string; [key: string]: any }>;
  details?: T;
  usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number };
  terminate?: boolean;
}

export interface AgentTool<TArgs = any, TDetails = any> {
  name: string;
  description: string;
  parameters?: any;
  executionMode?: ToolExecutionMode;
  prepareArguments?: (args: any) => any;
  execute: (
    toolCallId: string,
    args: TArgs,
    signal?: AbortSignal,
    onUpdate?: (partial: any) => void
  ) => Promise<AgentToolResult<TDetails>>;
}

export interface BeforeToolCallResult {
  block?: boolean;
  reason?: string;
  terminate?: boolean;
}

export interface BeforeToolCallContext {
  toolCall: AgentToolCall;
  args: any;
  context: AgentContext;
}

export interface AfterToolCallResult {
  content?: Array<{ type: string; text?: string; [key: string]: any }>;
  details?: any;
  isError?: boolean;
  terminate?: boolean;
  usage?: any;
}

export interface AfterToolCallContext {
  toolCall: AgentToolCall;
  args: any;
  result: AgentToolResult<any>;
  isError: boolean;
  context: AgentContext;
}

export interface ShouldStopAfterTurnContext {
  message: any;
  toolResults: any[];
  context: AgentContext;
  newMessages: any[];
  turnIndex: number;
}

export interface PrepareNextTurnContext extends ShouldStopAfterTurnContext {}

export interface AgentLoopTurnUpdate {
  context?: AgentContext;
  messages?: any[];
  model?: string;
  thinkingLevel?: ThinkingLevel;
}

export interface AgentContext {
  messages: any[];
  tools?: AgentTool<any>[];
  systemPrompt?: string;
}

export type StreamFn = (
  context: AgentContext,
  config: AgentLoopConfig,
  signal?: AbortSignal
) => Promise<AssistantTurnResult>;

export interface AssistantTurnResult {
  message: any;
  toolCalls: AgentToolCall[];
  stopReason?: 'end_turn' | 'tool_use' | 'length' | 'error' | 'aborted';
  errorMessage?: string;
}

export interface AgentLoopConfig {
  model?: any;
  reasoning?: any;
  thinkingLevel?: ThinkingLevel;
  maxIterations?: number;
  toolExecution?: ToolExecutionMode;
  signal?: AbortSignal;
  convertToLlm?: (messages: any[]) => any[] | Promise<any[]>;
  transformContext?: (messages: any[], signal?: AbortSignal) => Promise<any[]>;
  getApiKey?: (provider: string) => Promise<string | undefined> | string | undefined;
  beforeToolCall?: (context: BeforeToolCallContext, signal?: AbortSignal) => Promise<BeforeToolCallResult | undefined>;
  afterToolCall?: (context: AfterToolCallContext, signal?: AbortSignal) => Promise<AfterToolCallResult | undefined>;
  shouldStopAfterTurn?: (context: ShouldStopAfterTurnContext) => boolean | Promise<boolean>;
  prepareNextTurn?: (context: PrepareNextTurnContext) => AgentLoopTurnUpdate | undefined | Promise<AgentLoopTurnUpdate | undefined>;
  getSteeringMessages?: () => Promise<any[]>;
  getFollowUpMessages?: () => Promise<any[]>;
}

export interface AgentState {
  model?: any;
  thinkingLevel: ThinkingLevel;
  tools: AgentTool<any>[];
  messages: any[];
  readonly isStreaming: boolean;
  readonly pendingToolCalls: ReadonlySet<string>;
  readonly errorMessage?: string;
}
