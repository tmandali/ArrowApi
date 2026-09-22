/**
 * AgentSession - Core abstraction for agent lifecycle and session management.
 * Reference: earendil-works/pi/packages/coding-agent/src/core/agent-session.ts
 *
 * Sorumluluklar:
 * 1. Agent ve agentLoop çalışma zamanını koordine etmek
 * 2. Mesaj geçmişi, kalıcılık ve dallanma (Fork / Clone) yönetimi
 * 3. Otomatik ve manuel bağlam özeti (Compaction) yürütmek
 * 4. Steer, Follow-Up ve Abort kuyruklarını yönetmek
 * 5. Katlanarak artan gecikmeyle (exponential backoff) otomatik kurtarma (Auto-Retry)
 * 6. Standalone HTML Denetim Raporu üretimi (exportHtml)
 */

import { Agent } from './agent';
import type { QueueMode } from './agent-loop-types';
import type { AgentEvent, CompactionResult, CompactionSettings } from './types';
import { compactConversation } from './harness/compaction/compaction';
import { sessionHarness, type SessionDump } from './harness/session/session-harness';
import { delegatedToolRegistry } from './harness/tools/ui-delegation';
import { exportSessionToHtml } from './harness/telemetry/export-html';

export type AgentMessage = any;

export type AgentSessionEvent =
  | AgentEvent
  | { type: 'session_start'; sessionId: string }
  | { type: 'queue_update'; steering: readonly string[]; followUp: readonly string[] }
  | { type: 'compaction_start'; reason: 'manual' | 'threshold' }
  | { type: 'compaction_end'; reason: 'manual' | 'threshold'; result?: CompactionResult; success: boolean }
  | { type: 'auto_retry_start'; attempt: number; maxAttempts: number; delayMs: number; errorMessage: string }
  | { type: 'auto_retry_end'; success: boolean; attempt: number; finalError?: string };

export interface AgentSessionState {
  sessionId: string;
  isStreaming: boolean;
  isCompacting: boolean;
  steeringMode: QueueMode;
  followUpMode: QueueMode;
  messageCount: number;
  steeringQueueLength: number;
  followUpQueueLength: number;
  autoCompactionEnabled: boolean;
}

export interface AgentSessionConfig {
  agent: Agent;
  sessionId?: string;
  autoCompaction?: boolean;
  compactionSettings?: Partial<CompactionSettings>;
  autoRetry?: boolean;
  maxRetries?: number;
  onSaveMessages?: (messages: AgentMessage[]) => void;
}

function isRetryableError(err: any): boolean {
  if (!err) return false;
  const msg = (err.message || String(err)).toLowerCase();
  return (
    msg.includes('rate limit') ||
    msg.includes('429') ||
    msg.includes('503') ||
    msg.includes('timeout') ||
    msg.includes('network') ||
    msg.includes('fetch failed') ||
    msg.includes('econnreset')
  );
}

export class AgentSession {
  readonly agent: Agent;
  readonly sessionId: string;
  private listeners = new Set<(event: AgentSessionEvent) => void>();
  private autoCompactionEnabled: boolean;
  private compactionSettings: CompactionSettings;
  private autoRetryEnabled: boolean;
  private maxRetries: number;
  private isCompacting = false;
  private onSaveMessages?: (messages: AgentMessage[]) => void;

  constructor(config: AgentSessionConfig) {
    this.agent = config.agent;
    this.sessionId = config.sessionId || `session_${Date.now()}`;
    this.autoCompactionEnabled = config.autoCompaction ?? true;
    this.compactionSettings = {
      enabled: true,
      reserveTokens: 16384,
      keepRecentTokens: 20000,
      ...config.compactionSettings,
    };
    this.autoRetryEnabled = config.autoRetry ?? true;
    this.maxRetries = config.maxRetries ?? 3;
    this.onSaveMessages = config.onSaveMessages;

    // Agent olaylarını dinle ve session dinleyicilerine yay
    this.agent.subscribe((event) => {
      this.notify(event);

      if (event.type === 'agent_end' || event.type === 'turn_end') {
        this.saveMessages();
        if (this.autoCompactionEnabled) {
          void this.checkAutoCompaction();
        }
      }
    });
  }

  /**
   * Oturum olaylarına reaktif abonelik.
   */
  subscribe(listener: (event: AgentSessionEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(event: AgentSessionEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error('[AgentSession] Listener error:', err);
      }
    }
  }

  /**
   * Yeni bir kullanıcı görevi başlatır veya döngüyü sürdürür.
   * Pi referansındaki yerleşik auto-retry mantığını işletir.
   */
  async prompt(
    input: string | AgentMessage | AgentMessage[],
  ): Promise<AgentMessage[]> {
    let messages: AgentMessage[];
    if (typeof input === 'string') {
      messages = [{ role: 'user', content: input }];
    } else if (Array.isArray(input)) {
      messages = input;
    } else {
      messages = [input];
    }

    this.notify({ type: 'session_start', sessionId: this.sessionId });

    const maxAttempts = this.autoRetryEnabled ? this.maxRetries : 0;
    let attempt = 0;

    while (attempt <= maxAttempts) {
      try {
        const result = await this.agent.run(messages);
        this.saveMessages();
        if (attempt > 0) {
          this.notify({ type: 'auto_retry_end', success: true, attempt });
        }
        return result;
      } catch (err: any) {
        attempt++;
        if (attempt > maxAttempts || !isRetryableError(err)) {
          if (attempt > 1) {
            this.notify({ type: 'auto_retry_end', success: false, attempt, finalError: err?.message });
          }
          throw err;
        }

        const delayMs = Math.min(400 * Math.pow(2, attempt - 1), 8000);
        this.notify({
          type: 'auto_retry_start',
          attempt,
          maxAttempts,
          delayMs,
          errorMessage: err?.message || 'Geçici sağlayıcı/ağ hatası',
        });
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }

    throw new Error('AgentSession: Max retries exceeded');
  }

  steer(message: string): void {
    this.agent.steer(message);
    this.notifyQueueUpdate();
  }

  followUp(message: string): void {
    this.agent.followUp(message);
    this.notifyQueueUpdate();
  }

  abort(): void {
    delegatedToolRegistry.cancelAll('Session aborted by user');
    this.agent.abort();
  }

  clearQueue(): { steering: string[]; followUp: string[] } {
    const steering = this.agent.steeringQueue.drain().map((m) => String(m.content));
    const followUp = this.agent.followUpQueue.drain().map((m) => String(m.content));
    this.notifyQueueUpdate();
    return { steering, followUp };
  }

  hasSteering(): boolean {
    return this.agent.steeringQueue.length > 0;
  }

  hasFollowUp(): boolean {
    return this.agent.followUpQueue.length > 0;
  }

  getSteeringQueue(): any[] {
    return this.agent.steeringQueue.peek();
  }

  getFollowUpQueue(): any[] {
    return this.agent.followUpQueue.peek();
  }

  popSteer(): any | undefined {
    const item = this.agent.steeringQueue.dequeue();
    if (item) this.notifyQueueUpdate();
    return item;
  }

  popFollowUp(): any | undefined {
    const item = this.agent.followUpQueue.dequeue();
    if (item) this.notifyQueueUpdate();
    return item;
  }

  clearSteering(): void {
    this.agent.steeringQueue.drain();
    this.notifyQueueUpdate();
  }

  clearFollowUp(): void {
    this.agent.followUpQueue.drain();
    this.notifyQueueUpdate();
  }

  clear(): void {
    this.clearQueue();
  }

  async compact(customInstructions?: string): Promise<CompactionResult | null> {
    if (this.isCompacting) return null;
    this.isCompacting = true;
    this.notify({ type: 'compaction_start', reason: 'manual' });

    try {
      const messages = this.agent.messages;
      const { compactedMessages, result } = await compactConversation({
        messages,
        settings: this.compactionSettings,
        reason: 'manual',
        customInstructions,
      });

      if (result.compactedMessagesCount > 0) {
        this.agent.messages = compactedMessages;
        this.saveMessages();
      }

      this.notify({
        type: 'compaction_end',
        reason: 'manual',
        result,
        success: true,
      });
      return result;
    } catch (err: any) {
      this.notify({
        type: 'compaction_end',
        reason: 'manual',
        success: false,
      });
      console.error('[AgentSession] Compaction failed:', err);
      return null;
    } finally {
      this.isCompacting = false;
    }
  }

  private async checkAutoCompaction(): Promise<boolean> {
    if (!this.autoCompactionEnabled || this.isCompacting) return false;

    const jsonLen = JSON.stringify(this.agent.messages).length;
    const estTokens = Math.ceil(jsonLen / 3.5);

    if (estTokens > (this.compactionSettings.keepRecentTokens || 20000)) {
      this.notify({ type: 'compaction_start', reason: 'threshold' });
      this.isCompacting = true;
      try {
        const { compactedMessages, result } = await compactConversation({
          messages: this.agent.messages,
          settings: this.compactionSettings,
          reason: 'threshold',
        });
        if (result.compactedMessagesCount > 0) {
          this.agent.messages = compactedMessages;
          this.saveMessages();
        }
        this.notify({
          type: 'compaction_end',
          reason: 'threshold',
          result,
          success: true,
        });
        return true;
      } finally {
        this.isCompacting = false;
      }
    }
    return false;
  }

  /**
   * Oturumdan veya belirli bir mesaj noktasından yeni bir dal (branch/fork) açar.
   */
  fork(forkPointMessageId?: string): AgentSession {
    const allMessages = this.agent.messages;
    let branchedMessages = [...allMessages];
    if (forkPointMessageId) {
      const idx = allMessages.findIndex((m: any) => m.id === forkPointMessageId);
      if (idx !== -1) {
        branchedMessages = allMessages.slice(0, idx + 1);
      }
    }

    const forkedAgent = new Agent({
      initialMessages: branchedMessages,
      tools: this.agent.tools,
      model: this.agent.model,
      thinkingLevel: this.agent.thinkingLevel,
      streamFn: this.agent.options.streamFn,
      maxIterations: this.agent.options.maxIterations,
      shouldStopAfterTurn: this.agent.options.shouldStopAfterTurn,
    });

    return new AgentSession({
      agent: forkedAgent,
      sessionId: `${this.sessionId}_fork_${Date.now().toString(36)}`,
      autoCompaction: this.autoCompactionEnabled,
      compactionSettings: this.compactionSettings,
    });
  }

  clone(): AgentSession {
    return this.fork();
  }

  exportHtml(uiState?: Record<string, any>): string {
    return exportSessionToHtml(this.dump(uiState));
  }

  private notifyQueueUpdate(): void {
    this.notify({
      type: 'queue_update',
      steering: this.agent.steeringQueue.peek().map((m) => String(m.content)),
      followUp: this.agent.followUpQueue.peek().map((m) => String(m.content)),
    });
  }

  private saveMessages(): void {
    if (this.onSaveMessages) {
      this.onSaveMessages(this.agent.messages);
    }
  }

  getMessages(): AgentMessage[] {
    return this.agent.messages;
  }

  getState(): AgentSessionState {
    return {
      sessionId: this.sessionId,
      isStreaming: this.agent.state.isStreaming,
      isCompacting: this.isCompacting,
      steeringMode: this.agent.steeringQueue.mode,
      followUpMode: this.agent.followUpQueue.mode,
      messageCount: this.agent.messages.length,
      steeringQueueLength: this.agent.steeringQueue.peek().length,
      followUpQueueLength: this.agent.followUpQueue.peek().length,
      autoCompactionEnabled: this.autoCompactionEnabled,
    };
  }

  dump(uiState?: Record<string, any>): SessionDump {
    const d = sessionHarness.dumpSession(this.agent.messages, uiState);
    d.sessionId = this.sessionId;
    return d;
  }
}
