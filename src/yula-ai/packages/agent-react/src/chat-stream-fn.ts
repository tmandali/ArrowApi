/**
 * StreamFn Adapter connecting Next.js /api/agent/chat stream to Pi Agent Loop
 * Reference: reference-pi/packages/agent/src/stream-fn.ts
 */

import type { StreamFn, AssistantTurnResult, AgentToolCall } from '@my-agent/core';

export interface StreamFnOptions {
  endpoint: string;
  getContextSnapshot: () => any;
  getProvider?: () => string | undefined;
  getEndpoint?: () => string | undefined;
  getAiConfig?: () => { provider?: string; endpoint?: string; thinking?: boolean; effort?: string };
  onThoughtDelta?: (delta: string) => void;
  onAssistantUpdate?: (partialMessage: any) => void;
  onModelFallback?: (modelId: string, provider?: string) => void;
}

export function createYulaStreamFn(options: StreamFnOptions): StreamFn {
  return async (context, config, signal): Promise<AssistantTurnResult> => {
    const aiConfig = options.getAiConfig?.();
    const resolvedProvider = options.getProvider?.() ?? aiConfig?.provider;
    const resolvedEndpoint = options.getEndpoint?.() ?? aiConfig?.endpoint;
    const resolvedThinking = aiConfig?.thinking;
    const resolvedEffort = aiConfig?.effort;

    const response = await fetch(options.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: context.messages,
        model: config.model,
        ...(resolvedProvider ? { provider: resolvedProvider } : {}),
        ...(resolvedEndpoint ? { endpoint: resolvedEndpoint } : {}),
        ...(resolvedThinking !== undefined ? { thinkingEnabled: resolvedThinking } : {}),
        ...(resolvedEffort ? { effort: resolvedEffort } : {}),
        uiContext: options.getContextSnapshot(),
      }),
      signal,
    });

    if (!response.ok) {
      let errText = await response.text().catch(() => response.statusText);
      try {
        const parsed = JSON.parse(errText);
        if (parsed?.error) errText = typeof parsed.error === 'string' ? parsed.error : JSON.stringify(parsed.error);
      } catch {}
      const finalMsg = errText?.trim() || response.statusText || 'Internal Server Error';
      throw new Error(`LLM Gateway Error (${response.status}): ${finalMsg}`);
    }

    const serverModel = response.headers.get('x-yula-model');
    const serverProvider = response.headers.get('x-yula-provider');
    if (serverModel && options.onModelFallback) {
      options.onModelFallback(serverModel, serverProvider || undefined);
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
          } else if (trimmed.startsWith('3:')) {
            let errMsg = trimmed.slice(2);
            try {
              const parsed = JSON.parse(errMsg);
              errMsg = typeof parsed === 'string' ? parsed : (parsed?.errorText || parsed?.error || parsed?.message || errMsg);
            } catch {}
            throw new Error(errMsg || 'LLM Gateway Stream Error');
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
                  state: 'input-available',
                });
                stopReason = 'tool_use';
              }
            } catch {}
          } else if (trimmed.startsWith('a:')) {
            // Sunucuda yürütülen tool sonucu paketi (AI SDK a: formatı)
            try {
              const resData = JSON.parse(trimmed.slice(2));
              if (resData?.toolCallId) {
                const existingPart = assistantParts.find((p) => p.toolCallId === resData.toolCallId);
                if (existingPart) {
                  existingPart.state = 'output-available';
                  existingPart.output = resData.result ?? resData.output;
                }
                const idx = toolCalls.findIndex((c) => c.id === resData.toolCallId);
                if (idx !== -1) toolCalls.splice(idx, 1);
                if (toolCalls.length === 0) stopReason = 'end_turn';
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
                  state: 'input-available',
                });
                stopReason = 'tool_use';
              } else if (parsed?.type === 'tool-output-available' || parsed?.type === 'tool-result') {
                // Sunucuda yürütülen araç sonucu (AI SDK SSE formatı)
                const toolCallId = parsed.toolCallId;
                const output = parsed.output ?? parsed.result;
                const existingPart = assistantParts.find((p) => p.toolCallId === toolCallId);
                if (existingPart) {
                  existingPart.state = 'output-available';
                  existingPart.output = output;
                }
                const idx = toolCalls.findIndex((c) => c.id === toolCallId);
                if (idx !== -1) toolCalls.splice(idx, 1);
                if (toolCalls.length === 0) stopReason = 'end_turn';
              } else if (parsed?.type === 'message-metadata') {
                const meta = parsed.messageMetadata;
                if (meta?.model && options.onModelFallback) {
                  options.onModelFallback(meta.model, meta.provider);
                }
              } else if (parsed?.type === 'error') {
                const errMsg =
                  parsed.errorText ||
                  (typeof parsed.error === 'string' ? parsed.error : parsed.error?.message) ||
                  parsed.message ||
                  'LLM Stream Error';
                throw new Error(typeof errMsg === 'string' ? errMsg : JSON.stringify(errMsg));
              }
            } catch (err: any) {
              if (err instanceof Error) throw err;
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

    if (!accumulatedText && toolCalls.length === 0) {
      throw new Error("Boş yanıt alındı: LLM modeline veya yerel servise ulaşılamadı.");
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
