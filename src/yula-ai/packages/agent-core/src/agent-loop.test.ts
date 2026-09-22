import { describe, it, expect, vi } from 'vitest';
import { Agent } from './agent';
import { createStandardAgentTools } from './ui-tool-adapter';
import { uiRegistry } from './component-registry';
import { uiEventBus } from './event-bus';
import type { StreamFn } from './agent-loop-types';
import { z } from 'zod';

describe('Autonomous Agent Loop (Pi Reference Implementation)', () => {
  it('should run multi-turn tool execution loop until goal reached', async () => {
    // 1. Bir test bileşeni kaydet
    uiRegistry.register({
      id: 'criteria_form:test-report',
      actions: {
        SET_FIELDS: {
          schema: z.object({ criteria: z.record(z.string(), z.any()) }),
          whenToCall: 'When user wants to set filters',
          whenNotToCall: 'Never call without criteria',
        },
        RUN: {
          schema: z.object({ report: z.string() }),
          whenToCall: 'When running report',
          whenNotToCall: 'Never run without setting filters',
        },
      },
    });

    let turnCount = 0;
    const handledActions: string[] = [];

    uiEventBus.subscribe('criteria_form:test-report', (action, payload) => {
      handledActions.push(action);
      return { success: true, action, payload };
    });

    // Mock StreamFn: 1. tur SET_FIELDS çağırır, 2. tur RUN çağırır, 3. tur nihai metin verir
    const mockStreamFn: StreamFn = vi.fn(async (context) => {
      turnCount++;
      if (turnCount === 1) {
        return {
          message: { role: 'assistant', content: 'Filtreleri uyguluyorum...' },
          toolCalls: [
            {
              id: 'call_1',
              name: 'dispatch_component_action',
              arguments: {
                component_id: 'criteria_form:test-report',
                action: 'SET_FIELDS',
                payload: { criteria: { date: '2026-09-01' } },
              },
            },
          ],
        };
      } else if (turnCount === 2) {
        return {
          message: { role: 'assistant', content: 'Raporu çalıştırıyorum...' },
          toolCalls: [
            {
              id: 'call_2',
              name: 'dispatch_component_action',
              arguments: {
                component_id: 'criteria_form:test-report',
                action: 'RUN',
                payload: { report: 'test-report' },
              },
            },
          ],
        };
      } else {
        return {
          message: { role: 'assistant', content: 'Rapor başarıyla tamamlandı ve analiz hazırlandı.' },
          toolCalls: [],
          stopReason: 'end_turn' as const,
        };

      }
    });

    const agent = new Agent({
      tools: createStandardAgentTools(),
      streamFn: mockStreamFn,
      maxIterations: 10,
    });

    const events: string[] = [];
    agent.subscribe((e) => events.push(e.type));

    const result = await agent.run([
      { role: 'user', content: 'Raporu filtrele ve çalıştır' },
    ]);

    expect(turnCount).toBe(3);
    expect(handledActions).toEqual(['SET_FIELDS', 'RUN']);
    expect(result.length).toBeGreaterThan(3);
    expect(agent.messages.some((m) => m.content?.includes('Rapor başarıyla tamamlandı'))).toBe(true);
    expect(events).toContain('agent_start');
    expect(events).toContain('tool_execution_start');
    expect(events).toContain('tool_execution_end');
    expect(events).toContain('agent_end');
  });

  it('should suspend loop and seamlessly resume via steering without starting a new run', async () => {
    let turnCount = 0;
    const mockStreamFn: StreamFn = vi.fn(async (ctx) => {
      turnCount++;
      if (turnCount === 1) {
        return {
          message: { role: 'assistant', content: 'Lütfen seçim yapın.' },
          toolCalls: [
            {
              id: 'choice_1',
              name: 'ask_user_choice',
              arguments: {
                question: 'Hangi tarihi seçmek istersiniz?',
                options: ['Bugün', 'Dün', 'Son 7 Gün'],
              },
            },
          ],
        };
      }
      return {
        message: { role: 'assistant', content: `Seçilen tarihle devam ediliyor: ${ctx.messages[ctx.messages.length - 1]?.content}` },
        toolCalls: [],
      };
    });

    const agent = new Agent({
      tools: createStandardAgentTools(),
      streamFn: mockStreamFn,
      maxIterations: 5,
    });

    const runPromise = agent.run([{ role: 'user', content: 'Tarih seçimi yap' }]);

    // 1. Tur sonrası askıya alınmalı
    await new Promise((r) => setTimeout(r, 20));
    expect(agent.isSuspended).toBe(true);
    expect(turnCount).toBe(1);

    // Kullanıcı steering ile araya girer (yeni bir agent.run başlatmaz!)
    agent.steer('Bugün');
    await runPromise;

    // Ajan aynı döngü içinde 2. tura devam edip tamamlamış olmalı
    expect(turnCount).toBe(2);
    expect(agent.isSuspended).toBe(false);
    expect(agent.isStreaming).toBe(false);
    expect(agent.messages.some((m) => m.content?.includes('Bugün'))).toBe(true);
  });

  it('declareToolChanges should detect added and removed tools properly', async () => {
    const { declareToolChanges } = await import('./agent-loop');
    const context = {
      messages: [],
      tools: [{ name: 'tool_a' }, { name: 'tool_c' }] as any,
    };

    const delta = declareToolChanges(context, ['tool_a', 'tool_b']);
    expect(delta.updatedMessages.length).toBe(1);
    expect(delta.updatedMessages[0].content).toContain('Added: [tool_c]');
    expect(delta.updatedMessages[0].content).toContain('Removed: [tool_b]');
  });

  it('prepareNextTurn should dynamically cascade model and thinking level', async () => {
    let turnCount = 0;
    let receivedModel: string | undefined;
    let receivedThinking: string | undefined;

    const mockStreamFn: StreamFn = vi.fn(async (context, config) => {
      turnCount++;
      receivedModel = config.model;
      receivedThinking = config.thinkingLevel;

      if (turnCount === 1) {
        return {
          message: { role: 'assistant', content: 'Hızlı ön değerlendirme...' },
          toolCalls: [
            {
              id: 'c1',
              name: 'inspect_ui_state',
              arguments: {},
            },
          ],
        };
      }
      return {
        message: { role: 'assistant', content: 'Derin analiz tamamlandı.' },
        toolCalls: [],
        stopReason: 'end_turn' as const,
      };
    });

    const agent = new Agent({
      tools: createStandardAgentTools(),
      streamFn: mockStreamFn,
      maxIterations: 5,
      model: 'gpt-4o-mini',
      thinkingLevel: 'low',
      prepareNextTurn: async ({ turnIndex }) => {
        if (turnIndex === 1) {
          return {
            model: 'claude-3-7-sonnet',
            thinkingLevel: 'high',
          };
        }
      },
    });

    await agent.run([{ role: 'user', content: 'Analiz yap' }]);

    expect(turnCount).toBe(2);
    expect(receivedModel).toBe('claude-3-7-sonnet');
    expect(receivedThinking).toBe('high');
  });

  it('beforeToolCall should rewrite arguments passed to tool.execute', async () => {
    let executedArgs: any;
    const customTool = {
      name: 'test_mutation',
      description: 'Test mutation tool',
      parameters: z.object({ value: z.string(), sanitized: z.boolean().optional() }),
      execute: vi.fn(async (_id, args) => {
        executedArgs = args;
        return { content: [{ type: 'text', text: 'Success' }] };
      }),
    };

    const mockStreamFn: StreamFn = vi.fn(async (context) => {
      if (context.messages.length === 1) {
        return {
          message: { role: 'assistant', content: 'Mutating...' },
          toolCalls: [{ id: 'mut_1', name: 'test_mutation', arguments: { value: 'raw_input' } }],
        };
      }
      return { message: { role: 'assistant', content: 'Done' }, toolCalls: [], stopReason: 'end_turn' as const };
    });

    const agent = new Agent({
      tools: [customTool],
      streamFn: mockStreamFn,
      maxIterations: 3,
      beforeToolCall: async ({ args }) => {
        return {
          args: { ...args, value: args.value.toUpperCase(), sanitized: true },
        };
      },
    });

    await agent.run([{ role: 'user', content: 'Execute' }]);
    expect(executedArgs).toEqual({ value: 'RAW_INPUT', sanitized: true });
  });

  it('beforeToolCall should fail closed when hook throws an exception', async () => {
    let toolExecuted = false;
    const customTool = {
      name: 'risky_action',
      description: 'Risky tool',
      parameters: z.object({}),
      execute: vi.fn(async () => {
        toolExecuted = true;
        return { content: [{ type: 'text', text: 'Should not run' }] };
      }),
    };

    const mockStreamFn: StreamFn = vi.fn(async (context) => {
      if (context.messages.length === 1) {
        return {
          message: { role: 'assistant', content: 'Running risky...' },
          toolCalls: [{ id: 'risk_1', name: 'risky_action', arguments: {} }],
        };
      }
      return { message: { role: 'assistant', content: 'Handled block' }, toolCalls: [], stopReason: 'end_turn' as const };
    });

    const agent = new Agent({
      tools: [customTool],
      streamFn: mockStreamFn,
      maxIterations: 3,
      beforeToolCall: async () => {
        throw new Error('Unauthorized policy violation in before_tool');
      },
    });

    const result = await agent.run([{ role: 'user', content: 'Execute risky' }]);
    // Tool must NOT execute (fail-closed)
    expect(toolExecuted).toBe(false);
    // Synthetic error message delivered to conversation
    const toolMsg = result.find((m: any) => m.role === 'toolResult');
    expect(toolMsg).toBeDefined();
    expect(JSON.stringify(toolMsg.content)).toContain('before_tool failed: Unauthorized policy violation');
  });
});
