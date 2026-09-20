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

  it('should suspend loop when ask_user_choice is invoked (Inline HITL)', async () => {
    let turnCount = 0;
    const mockStreamFn: StreamFn = vi.fn(async () => {
      turnCount++;
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
    });

    const agent = new Agent({
      tools: createStandardAgentTools(),
      streamFn: mockStreamFn,
      maxIterations: 5,
    });

    await agent.run([{ role: 'user', content: 'Tarih seçimi yap' }]);

    // ask_user_choice terminate: true olduğu için 1. turdan sonra döngü durur
    expect(turnCount).toBe(1);
    expect(agent.isStreaming).toBe(false);
  });
});
