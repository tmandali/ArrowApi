/**
 * Stateful Agent Controller wrapping the low-level agent loop
 * Direct Reference: reference-pi/packages/agent/src/agent.ts
 */

import { agentLoop } from './agent-loop';
import type { AgentEvent } from './types';
import type {
  AgentContext,
  AgentLoopConfig,
  AgentState,
  AgentTool,
  QueueMode,
  StreamFn,
  ThinkingLevel,
} from './agent-loop-types';

export class PendingMessageQueue {
  private messages: any[] = [];
  private waitResolvers: Array<() => void> = [];

  constructor(public mode: QueueMode = 'one-at-a-time') {}

  enqueue(message: any): void {
    this.messages.push(message);
    const resolver = this.waitResolvers.shift();
    if (resolver) resolver();
  }

  waitForMessage(signal?: AbortSignal): Promise<void> {
    if (this.messages.length > 0) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      const onAbort = () => {
        const idx = this.waitResolvers.indexOf(resolve);
        if (idx !== -1) this.waitResolvers.splice(idx, 1);
        reject(new Error('Aborted while waiting for steering'));
      };
      if (signal?.aborted) return onAbort();
      signal?.addEventListener('abort', onAbort, { once: true });
      this.waitResolvers.push(() => {
        signal?.removeEventListener('abort', onAbort);
        resolve();
      });
    });
  }

  hasItems(): boolean {
    return this.messages.length > 0;
  }

  get length(): number {
    return this.messages.length;
  }

  peek(): any[] {
    return [...this.messages];
  }

  dequeue(): any | undefined {
    return this.messages.shift();
  }

  drain(): any[] {
    if (this.mode === 'all') {
      const drained = this.messages.slice();
      this.messages = [];
      return drained;
    }
    const first = this.messages.shift();
    return first ? [first] : [];
  }

  clear(): void {
    this.messages = [];
  }
}

export interface AgentOptions {
  initialMessages?: any[];
  tools?: AgentTool<any>[];
  model?: any;
  thinkingLevel?: ThinkingLevel;
  streamFn: StreamFn;
  maxIterations?: number;
  steeringMode?: QueueMode;
  followUpMode?: QueueMode;
  beforeToolCall?: AgentLoopConfig['beforeToolCall'];
  afterToolCall?: AgentLoopConfig['afterToolCall'];
  shouldStopAfterTurn?: AgentLoopConfig['shouldStopAfterTurn'];
  shouldSuspendTurn?: AgentLoopConfig['shouldSuspendTurn'];
  prepareNextTurn?: AgentLoopConfig['prepareNextTurn'];
}

export class Agent implements AgentState {
  private _messages: any[] = [];
  private _tools: AgentTool<any>[] = [];
  private _isStreaming = false;
  private _isSuspended = false;
  private _pendingToolCalls = new Set<string>();
  private _errorMessage?: string;
  private currentAbortController?: AbortController;

  public model: any;
  public thinkingLevel: ThinkingLevel;
  public readonly steeringQueue: PendingMessageQueue;
  public readonly followUpQueue: PendingMessageQueue;
  private readonly listeners = new Set<(event: AgentEvent) => void>();

  constructor(public options: AgentOptions) {
    this._messages = options.initialMessages ? [...options.initialMessages] : [];
    this._tools = options.tools ? [...options.tools] : [];
    this.model = options.model;
    this.thinkingLevel = options.thinkingLevel ?? 'off';
    this.steeringQueue = new PendingMessageQueue(options.steeringMode ?? 'one-at-a-time');
    this.followUpQueue = new PendingMessageQueue(options.followUpMode ?? 'one-at-a-time');
  }

  get messages(): any[] {
    return this._messages;
  }
  set messages(val: any[]) {
    this._messages = [...val];
  }

  get tools(): AgentTool<any>[] {
    return this._tools;
  }
  set tools(val: AgentTool<any>[]) {
    this._tools = [...val];
  }

  get isStreaming(): boolean {
    return this._isStreaming;
  }

  get isSuspended(): boolean {
    return this._isSuspended;
  }

  get pendingToolCalls(): ReadonlySet<string> {
    return this._pendingToolCalls;
  }

  get errorMessage(): string | undefined {
    return this._errorMessage;
  }

  get state(): AgentState {
    return {
      messages: this.messages,
      tools: this.tools,
      isStreaming: this.isStreaming,
      isSuspended: this.isSuspended,
      pendingToolCalls: this.pendingToolCalls,
      errorMessage: this.errorMessage,
      thinkingLevel: this.thinkingLevel,
    };
  }

  subscribe(listener: (event: AgentEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: AgentEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error('[Agent Event Listener Error]:', err);
      }
    }
  }

  steer(message: string | any): void {
    const msg = typeof message === 'string'
      ? { id: `steer_${Date.now()}`, role: 'user', content: message, timestamp: Date.now() }
      : message;
    this.steeringQueue.enqueue(msg);
    this.emit({ type: 'steer_injected', message: typeof message === 'string' ? message : message.content });
  }

  followUp(message: string | any): void {
    const msg = typeof message === 'string'
      ? { id: `follow_${Date.now()}`, role: 'user', content: message, timestamp: Date.now() }
      : message;
    this.followUpQueue.enqueue(msg);
    this.emit({ type: 'follow_up_queued', message: typeof message === 'string' ? message : message.content });
  }

  abort(): void {
    if (this.currentAbortController) {
      this.currentAbortController.abort();
      this.currentAbortController = undefined;
    }
    this._isStreaming = false;
    this._isSuspended = false;
  }

  async run(prompts: any[], externalSignal?: AbortSignal): Promise<any[]> {
    if (this._isStreaming) {
      this.abort();
    }

    this._isStreaming = true;
    this._errorMessage = undefined;
    const ac = new AbortController();
    this.currentAbortController = ac;

    if (externalSignal) {
      externalSignal.addEventListener('abort', () => ac.abort(), { once: true });
    }

    const context: AgentContext = {
      messages: this._messages,
      tools: this._tools,
    };

    const config: AgentLoopConfig = {
      model: this.model,
      thinkingLevel: this.thinkingLevel,
      maxIterations: this.options.maxIterations ?? 20,
      signal: ac.signal,
      beforeToolCall: this.options.beforeToolCall,
      afterToolCall: this.options.afterToolCall,
      shouldStopAfterTurn: this.options.shouldStopAfterTurn,
      shouldSuspendTurn: this.options.shouldSuspendTurn,
      prepareNextTurn: this.options.prepareNextTurn,
      getSteeringMessages: async () => this.steeringQueue.drain(),
      getFollowUpMessages: async () => this.followUpQueue.drain(),
      waitForSteering: async (sig) => this.steeringQueue.waitForMessage(sig),
    };

    const stream = agentLoop(prompts, context, config, ac.signal, this.options.streamFn);

    try {
      for await (const event of stream) {
        if (event.type === 'tool_execution_start') {
          this._pendingToolCalls.add(event.toolCallId);
        } else if (event.type === 'tool_execution_end') {
          this._pendingToolCalls.delete(event.toolCallId);
        } else if (event.type === 'turn_suspended') {
          this._isSuspended = true;
        } else if (event.type === 'turn_resumed' || event.type === 'agent_end') {
          this._isSuspended = false;
        }
        this.emit(event);
      }
      const finalMessages = await stream.result();
      this._messages = [...this._messages, ...finalMessages];
      return finalMessages;
    } catch (err: any) {
      this._errorMessage = err?.message || String(err);
      throw err;
    } finally {
      this._isStreaming = false;
      this._isSuspended = false;
      this.currentAbortController = undefined;
    }
  }
}
