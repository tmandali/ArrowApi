import { describe, it, expect, vi } from 'vitest';
import { Agent } from './agent';
import { AgentSession } from './agent-session';
import { delegatedToolRegistry } from './harness/tools/ui-delegation';
import { createStandardAgentTools } from './harness/tools/ui-tool-adapter';
import { uiRegistry } from './harness/ui-bridge/component-registry';

describe('AgentSession Pure Pi Architecture', () => {
  it('should initialize AgentSession and run multi-turn prompt successfully', async () => {
    let turnCount = 0;
    const streamFn = vi.fn().mockImplementation(async () => {
      turnCount++;
      if (turnCount === 1) {
        return {
          message: { role: 'assistant', content: 'Filtre uyguluyorum...' },
          toolCalls: [
            {
              id: 'tc_1',
              name: 'dispatch_component_action',
              arguments: {
                component_id: 'filter_form',
                action: 'SET_FIELDS',
                payload: { storeId: 'Kadıköy' },
              },
            },
          ],
        };
      }
      return {
        message: { role: 'assistant', content: 'Filtre uygulandı, işlem tamam.' },
        toolCalls: [],
      };
    });

    // Register a mock component
    uiRegistry.register({
      id: 'filter_form',
      capabilities: ['criteria', 'SET_FIELDS'],
      actions: {
        SET_FIELDS: { whenToCall: 'Filtre uygula', whenNotToCall: 'Kriter yoksa çağırma' },
      },
    });

    const agent = new Agent({
      streamFn,
      tools: createStandardAgentTools(),
    });

    const session = new AgentSession({
      agent,
      sessionId: 'test_session_1',
      autoCompaction: false,
    });

    const sessionEvents: string[] = [];
    session.subscribe((e) => {
      sessionEvents.push(e.type);
    });

    const messages = await session.prompt('Kadıköy mağazasını seç');

    expect(messages.length).toBeGreaterThanOrEqual(3);
    expect(sessionEvents).toContain('session_start');
    expect(sessionEvents).toContain('tool_execution_start');
    expect(sessionEvents).toContain('tool_execution_end');
    expect(sessionEvents).toContain('agent_end');
    expect(session.getState().sessionId).toBe('test_session_1');
    expect(session.getState().messageCount).toBe(messages.length);
  });

  it('should support steering and follow-up queues via AgentSession', async () => {
    const streamFn = vi.fn().mockResolvedValue({
      message: { role: 'assistant', content: 'Tamamlandı.' },
      toolCalls: [],
    });

    const agent = new Agent({ streamFn });
    const session = new AgentSession({ agent, autoCompaction: false });

    session.steer('Araya girme talimatı');
    session.followUp('Görev sonrası takip talimatı');

    const state = session.getState();
    expect(state.steeringQueueLength).toBe(1);
    expect(state.followUpQueueLength).toBe(1);

    const cleared = session.clearQueue();
    expect(cleared.steering).toEqual(['Araya girme talimatı']);
    expect(cleared.followUp).toEqual(['Görev sonrası takip talimatı']);

    const stateAfter = session.getState();
    expect(stateAfter.steeringQueueLength).toBe(0);
    expect(stateAfter.followUpQueueLength).toBe(0);
  });

  it('should delegate UI tools via delegatedToolRegistry custom handler', async () => {
    const handler = vi.fn().mockImplementation(async (req) => {
      return {
        id: req.id,
        success: true,
        result: { customDelegated: true, receivedAction: req.payload?.action },
      };
    });

    const unregister = delegatedToolRegistry.registerHandler(handler);

    const streamFn = vi.fn().mockImplementation(async (ctx: any) => {
      const hasToolResult = ctx.messages.some((m: any) => m.role === 'toolResult');
      if (!hasToolResult) {
        return {
          message: { role: 'assistant', content: 'Delegated eylem...' },
          toolCalls: [
            {
              id: 'tc_delegated_1',
              name: 'dispatch_component_action',
              arguments: {
                component_id: 'remote_grid',
                action: 'PIN',
                payload: { column: 'storeId' },
              },
            },
          ],
        };
      }
      return {
        message: { role: 'assistant', content: 'İşlem bitti.' },
        toolCalls: [],
      };
    });

    // Register remote_grid so preflight passes
    uiRegistry.register({
      id: 'remote_grid',
      capabilities: ['PIN'],
      actions: { PIN: { whenToCall: 'Sabitle', whenNotToCall: 'Gereksizse sabitleme' } },
    });

    const agent = new Agent({
      streamFn,
      tools: createStandardAgentTools(),
    });
    const session = new AgentSession({ agent, autoCompaction: false });

    await session.prompt('Gridi sabitle');

    expect(handler).toHaveBeenCalled();
    const calledReq = handler.mock.calls[0][0];
    expect(calledReq.method).toBe('dispatch_component_action');
    expect(calledReq.payload.component_id).toBe('remote_grid');
    expect(calledReq.payload.action).toBe('PIN');

    unregister();
  });

  it('should fork and clone session preserving branch history', async () => {
    const streamFn = vi.fn().mockResolvedValue({
      message: { role: 'assistant', content: 'Cevap' },
      toolCalls: [],
    });
    const agent = new Agent({
      streamFn,
      initialMessages: [{ id: 'm1', role: 'user', content: 'İlk mesaj' }],
    });
    const session = new AgentSession({ agent, sessionId: 'main_session' });
    const forked = session.fork();
    expect(forked.sessionId).toContain('main_session_fork_');
    expect(forked.getMessages().length).toBe(1);
    expect(forked.getMessages()[0].content).toBe('İlk mesaj');

    const cloned = session.clone();
    expect(cloned.sessionId).toContain('main_session_fork_');
  });

  it('should export standalone HTML session report', async () => {
    const streamFn = vi.fn().mockResolvedValue({
      message: { role: 'assistant', content: 'Analiz tamam.' },
      toolCalls: [],
    });
    const agent = new Agent({ streamFn });
    const session = new AgentSession({ agent, sessionId: 'report_session' });
    await session.prompt('Rapor ver');

    const html = session.exportHtml();
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('Yula AI Oturum Raporu');
    expect(html).toContain('report_session');
    expect(html).toContain('Analiz tamam.');
  });

  it('should break loop when model is trapped in stagnation', async () => {
    const streamFn = vi.fn().mockResolvedValue({
      message: { role: 'assistant', content: 'Tekrar eden eylem...' },
      toolCalls: [
        {
          id: 'tc_stuck',
          name: 'dispatch_component_action',
          arguments: { component_id: 'filter_form', action: 'SET_FIELDS', payload: { x: 1 } },
        },
      ],
    });

    uiRegistry.register({
      id: 'filter_form',
      capabilities: ['SET_FIELDS'],
      actions: { SET_FIELDS: { whenToCall: 'call', whenNotToCall: 'never' } },
    });

    const agent = new Agent({ streamFn, tools: createStandardAgentTools(), maxIterations: 10 });
    const session = new AgentSession({ agent });
    const msgs = await session.prompt('Takıl');

    expect(msgs.some((m) => m.content?.includes('Stagnation Detected'))).toBe(true);
  });

  it('should auto-retry on transient failure and succeed', async () => {
    let attempts = 0;
    const streamFn = vi.fn().mockImplementation(async () => {
      attempts++;
      if (attempts === 1) {
        throw new Error('503 Service Unavailable (rate limit)');
      }
      return {
        message: { role: 'assistant', content: 'Kurtarıldı!' },
        toolCalls: [],
      };
    });

    const agent = new Agent({ streamFn });
    const session = new AgentSession({ agent, autoRetry: true, maxRetries: 2 });
    const events: string[] = [];
    session.subscribe((e) => events.push(e.type));

    const res = await session.prompt('Test retry');
    expect(events).toContain('auto_retry_start');
    expect(events).toContain('auto_retry_end');
    expect(res.some((m) => m.content === 'Kurtarıldı!')).toBe(true);
  });
});
