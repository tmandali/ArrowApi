/**
 * StreamFn Adapter connecting Next.js /api/agent/chat stream to Pi Agent Loop
 * Reference: reference-pi/packages/agent/src/stream-fn.ts
 */

import type { StreamFn, AssistantTurnResult, AgentToolCall } from '@my-agent/core';

export interface StreamFnOptions {
  endpoint: string;
  getContextSnapshot: () => any;
  onThoughtDelta?: (delta: string) => void;
  onAssistantUpdate?: (partialMessage: any) => void;
}

export function createYulaStreamFn(options: StreamFnOptions): StreamFn {
  return async (context, config, signal): Promise<AssistantTurnResult> => {
    const response = await fetch(options.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: context.messages,
        model: config.model,
        uiContext: options.getContextSnapshot(),
      }),
      signal,
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => response.statusText);
      throw new Error(`LLM Gateway Error (${response.status}): ${errText}`);
    }

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    let accumulatedText = '';
    const toolCalls: AgentToolCall[] = [];
    const assistantParts: any[] = [];
    let streamUsage: any;
    let stopReason: AssistantTurnResult['stopReason'] = 'end_turn';

    if (reader) {
      let buffer = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          // 1. Vercel AI SDK text stream (0:"...")
          if (trimmed.startsWith('0:')) {
            try {
              const chunk = JSON.parse(trimmed.slice(2));
              const delta = typeof chunk === 'string' ? chunk : chunk?.delta ?? chunk?.text ?? '';
              if (delta) {
                accumulatedText += delta;
                options.onThoughtDelta?.(delta);
              }
            } catch {
              accumulatedText += trimmed.slice(2);
            }
          } else if (trimmed.startsWith('9:') || trimmed.startsWith('b:')) {
            // Tool çağrısı paketi
            try {
              const callData = JSON.parse(trimmed.slice(2));
              if (callData?.toolName) {
                const call: AgentToolCall = {
                  id: callData.toolCallId || `tc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                  name: callData.toolName,
                  arguments: callData.args || callData.input || {},
                };
                toolCalls.push(call);
                assistantParts.push({
                  type: `tool-${call.name}`,
                  toolCallId: call.id,
                  toolName: call.name,
                  input: call.arguments,
                  state: 'call',
                });
                stopReason = 'tool_use';
              }
            } catch {}
          } else if (trimmed.startsWith('d:') || trimmed.startsWith('e:')) {
            try {
              const fin = JSON.parse(trimmed.slice(2));
              if (fin?.usage) streamUsage = fin.usage;
            } catch {}
          } else if (trimmed.startsWith('data:')) {
            const ssePayload = trimmed.slice(5).trim();
            if (ssePayload === '[DONE]') break;
            try {
              const parsed = JSON.parse(ssePayload);
              if (parsed?.type === 'text-delta') {
                const delta = parsed.delta ?? parsed.textDelta ?? '';
                if (delta) {
                  accumulatedText += delta;
                  options.onThoughtDelta?.(delta);
                }
              } else if (parsed?.type === 'tool-input-available' || parsed?.type === 'tool-call') {
                const call: AgentToolCall = {
                  id: parsed.toolCallId || `tc_${Date.now()}`,
                  name: parsed.toolName,
                  arguments: parsed.input || parsed.args || {},
                };
                toolCalls.push(call);
                assistantParts.push({
                  type: `tool-${call.name}`,
                  toolCallId: call.id,
                  toolName: call.name,
                  input: call.arguments,
                  state: 'call',
                });
                stopReason = 'tool_use';
              }
            } catch {
              accumulatedText += ssePayload;
            }
          }

          // UI'a anlık mesaj güncellemesi
          const partialMsg = {
            role: 'assistant',
            content: accumulatedText,
            parts: [
              ...(accumulatedText ? [{ type: 'text', text: accumulatedText }] : []),
              ...assistantParts,
            ],
            toolInvocations: toolCalls.map((tc) => ({
              toolCallId: tc.id,
              toolName: tc.name,
              args: tc.arguments,
              state: 'call',
            })),
            metadata: streamUsage ? { usage: streamUsage } : undefined,
          };
          options.onAssistantUpdate?.(partialMsg);
        }
      }
    }

    const finalAssistantMessage = {
      id: `asst_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      role: 'assistant',
      content: accumulatedText,
      parts: [
        ...(accumulatedText ? [{ type: 'text', text: accumulatedText }] : []),
        ...assistantParts,
      ],
      toolInvocations: toolCalls.map((tc) => ({
        toolCallId: tc.id,
        toolName: tc.name,
        args: tc.arguments,
        state: 'call',
      })),
      metadata: streamUsage ? { usage: streamUsage } : undefined,
      createdAt: new Date(),
    };

    return {
      message: finalAssistantMessage,
      toolCalls,
      stopReason: toolCalls.length > 0 ? 'tool_use' : stopReason,
    };
  };
}
