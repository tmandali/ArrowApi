/**
 * Autonomous Agent Loop Engine
 * Direct Reference: reference-pi/packages/agent/src/agent-loop.ts
 */

import { EventStream } from './harness/telemetry/event-stream';
import type { AgentEvent } from './types';
import type {
  AgentContext,
  AgentLoopConfig,
  AgentTool,
  AgentToolCall,
  AgentToolResult,
  BeforeToolCallContext,
  BeforeToolCallResult,
  AfterToolCallContext,
  AfterToolCallResult,
  ShouldStopAfterTurnContext,
  StreamFn,
} from './agent-loop-types';

export type AgentEventSink = (event: AgentEvent) => Promise<void> | void;

interface FinalizedToolOutcome {
  toolCall: AgentToolCall;
  result: AgentToolResult;
  isError: boolean;
}

interface ExecutedToolBatch {
  messages: any[];
  terminate: boolean;
  suspend?: boolean;
}

/**
 * Pi-Style Tool Loadout Delta: Aktif araç seti değiştiğinde transkripte sistem bildirimi ekler.
 */
export function declareToolChanges(
  context: AgentContext,
  lastToolNames: string[]
): { updatedMessages: any[]; currentToolNames: string[] } {
  const currentTools = context.tools?.map((t) => t.name) || [];
  if (lastToolNames.length === 0) {
    return { updatedMessages: [], currentToolNames: currentTools };
  }

  const added = currentTools.filter((name) => !lastToolNames.includes(name));
  const removed = lastToolNames.filter((name) => !currentTools.includes(name));

  if (added.length === 0 && removed.length === 0) {
    return { updatedMessages: [], currentToolNames: currentTools };
  }

  const deltaMsg = {
    role: 'system',
    content: `[Tools Loadout Updated]: Added: [${added.join(', ') || 'none'}], Removed: [${removed.join(', ') || 'none'}].`,
  };

  return { updatedMessages: [deltaMsg], currentToolNames: currentTools };
}

export function agentLoop(
  prompts: any[],
  context: AgentContext,
  config: AgentLoopConfig,
  signal: AbortSignal | undefined,
  streamFn: StreamFn
): EventStream<AgentEvent, any[]> {
  const stream = new EventStream<AgentEvent, any[]>(
    (e) => e.type === 'agent_end',
    (e) => (e.type === 'agent_end' ? e.messages || [] : [])
  );

  void runAgentLoop(
    prompts,
    context,
    config,
    async (ev) => stream.push(ev),
    signal,
    streamFn
  ).then(
    (messages) => stream.end(messages),
    (err) => stream.error(err)
  );

  return stream;
}

export async function runAgentLoop(
  prompts: any[],
  context: AgentContext,
  config: AgentLoopConfig,
  emit: AgentEventSink,
  signal: AbortSignal | undefined,
  streamFn: StreamFn
): Promise<any[]> {
  const newMessages = [...prompts];
  const currentContext: AgentContext = {
    ...context,
    messages: [...context.messages, ...prompts],
  };

  await emit({ type: 'agent_start', prompt: prompts[0]?.content });
  await emit({ type: 'turn_start', turnIndex: 0 });
  for (const m of prompts) {
    await emit({ type: 'message_start', message: m });
    await emit({ type: 'message_end', message: m });
  }

  await runLoop(currentContext, newMessages, config, signal, emit, streamFn);
  return newMessages;
}

async function runLoop(
  initialContext: AgentContext,
  newMessages: any[],
  initialConfig: AgentLoopConfig,
  signal: AbortSignal | undefined,
  emit: AgentEventSink,
  streamFn: StreamFn
): Promise<void> {
  let currentContext = initialContext;
  let config = initialConfig;
  let turnIndex = 0;
  const maxTurns = config.maxIterations ?? 20;
  let pendingMessages: any[] = (await config.getSteeringMessages?.()) || [];

  // Pi Outer Loop: Follow-up kuyruğu drain edilene kadar döner
  const recentToolSignatures: string[] = [];
  let committedToolNames: string[] = currentContext.tools?.map((t) => t.name) || [];

  while (true) {
    let hasMoreToolCalls = true;

    // Pi Inner Loop: Araç çağrıları veya steering mesajları oldukça döner
    while ((hasMoreToolCalls || pendingMessages.length > 0) && turnIndex < maxTurns) {
      if (signal?.aborted) {
        await emit({ type: 'agent_end', messages: newMessages });
        return;
      }

      turnIndex++;

      // Kuyruktaki steering mesajlarını transkripte işle
      for (const msg of pendingMessages) {
        currentContext.messages.push(msg);
        newMessages.push(msg);
        await emit({ type: 'message_start', message: msg });
        await emit({ type: 'message_end', message: msg });
      }
      pendingMessages = [];

      // Pi Tool Loadout Delta: Araç seti değişmişse modele açık sistem bildirimi yap
      const toolDelta = declareToolChanges(currentContext, committedToolNames);
      if (toolDelta.updatedMessages.length > 0) {
        committedToolNames = toolDelta.currentToolNames;
        for (const msg of toolDelta.updatedMessages) {
          currentContext.messages.push(msg);
          newMessages.push(msg);
          await emit({ type: 'message_start', message: msg });
          await emit({ type: 'message_end', message: msg });
        }
      }

      // LLM Çıkarımı
      const turnResult = await streamFn(currentContext, config, signal);
      const assistantMessage = turnResult.message;
      currentContext.messages.push(assistantMessage);
      newMessages.push(assistantMessage);

      if (turnResult.stopReason === 'error' || turnResult.stopReason === 'aborted') {
        await emit({ type: 'turn_end', message: assistantMessage, toolResults: [] });
        await emit({ type: 'agent_end', messages: newMessages });
        return;
      }

      const toolCalls = turnResult.toolCalls || [];
      const toolResultMessages: any[] = [];
      hasMoreToolCalls = false;

      let batch: ExecutedToolBatch | undefined;

      if (toolCalls.length > 0) {
        // Pi Stagnation (kısırdöngü) sezici: aynı araç ve parametrelerle 3 ardışık tur
        const fp = toolCalls
          .map((tc: any) => `${tc.name}:${JSON.stringify(tc.arguments || {})}`)
          .sort()
          .join('|');
        recentToolSignatures.push(fp);
        if (recentToolSignatures.length >= 3) {
          const last3 = recentToolSignatures.slice(-3);
          if (last3.every((sig) => sig === fp)) {
            const stagnationMsg = {
              role: 'assistant',
              content: '⚠️ [Stagnation Detected]: Model aynı araç çağrılarıyla kısırdöngüye girdi. Güvenlik amacıyla döngü durduruldu.',
            };
            currentContext.messages.push(stagnationMsg);
            newMessages.push(stagnationMsg);
            await emit({ type: 'turn_end', message: stagnationMsg, toolResults: [] });
            await emit({ type: 'agent_end', messages: newMessages });
            return;
          }
        }

        // Output token sınırında yarım kalan çağrıları güvenle ele al
        batch =
          turnResult.stopReason === 'length'
            ? await failTruncatedCalls(toolCalls, emit)
            : await executeToolCalls(currentContext, toolCalls, config, signal, emit);

        toolResultMessages.push(...batch.messages);
        hasMoreToolCalls = !batch.terminate;

        for (const resMsg of batch.messages) {
          currentContext.messages.push(resMsg);
          newMessages.push(resMsg);
        }
      }

      await emit({ type: 'turn_end', message: assistantMessage, toolResults: toolResultMessages });

      const stopContext: ShouldStopAfterTurnContext = {
        message: assistantMessage,
        toolResults: toolResultMessages,
        context: currentContext,
        newMessages,
        turnIndex,
      };

      if (await config.shouldStopAfterTurn?.(stopContext)) {
        await emit({ type: 'agent_end', messages: newMessages });
        return;
      }

      // Pi Suspension & Steering: Araç veya model araya girme / yönlendirme bekliyorsa askıya al
      const isSuspended = Boolean(batch?.suspend || (await config.shouldSuspendTurn?.(stopContext)));
      if (isSuspended) {
        await emit({
          type: 'state_transition',
          from: 'tool_executing',
          to: 'suspended',
          reason: 'steering',
          stepIndex: turnIndex,
          timestamp: Date.now(),
        });
        await emit({
          type: 'turn_suspended',
          stepIndex: turnIndex,
          reason: 'steering',
          prompt: assistantMessage?.content,
          timestamp: Date.now(),
        });

        if (config.waitForSteering) {
          try {
            await config.waitForSteering(signal);
            pendingMessages = (await config.getSteeringMessages?.()) || [];
            await emit({
              type: 'state_transition',
              from: 'suspended',
              to: 'thinking',
              reason: 'steering_received',
              stepIndex: turnIndex,
              timestamp: Date.now(),
            });
            await emit({
              type: 'turn_resumed',
              stepIndex: turnIndex,
              message: pendingMessages[0]?.content,
              timestamp: Date.now(),
            });
            hasMoreToolCalls = true;
            continue;
          } catch {
            if (signal?.aborted) {
              await emit({ type: 'agent_end', messages: newMessages });
              return;
            }
          }
        }
      }

      // Pi prepareNextTurn: Tur sonrası dinamik model/thinking terfisi veya bağlam hazırlığı
      if (config.prepareNextTurn) {
        const turnUpdate = await config.prepareNextTurn(stopContext);
        if (turnUpdate) {
          if (turnUpdate.context) currentContext = turnUpdate.context;
          if (turnUpdate.model) config = { ...config, model: turnUpdate.model };
          if (turnUpdate.thinkingLevel) config = { ...config, thinkingLevel: turnUpdate.thinkingLevel };
          if (turnUpdate.messages && turnUpdate.messages.length > 0) {
            for (const msg of turnUpdate.messages) {
              currentContext.messages.push(msg);
              newMessages.push(msg);
              await emit({ type: 'message_start', message: msg });
              await emit({ type: 'message_end', message: msg });
            }
          }
        }
      }

      // Sonraki tur için steering kontrolü
      pendingMessages = (await config.getSteeringMessages?.()) || [];
    }

    // Outer loop: Follow-up işi var mı kontrol et
    const followUp = (await config.getFollowUpMessages?.()) || [];
    if (followUp.length > 0 && turnIndex < maxTurns) {
      pendingMessages = followUp;
      continue;
    }

    break;
  }

  await emit({ type: 'agent_end', messages: newMessages });
}

async function executeToolCalls(
  context: AgentContext,
  toolCalls: AgentToolCall[],
  config: AgentLoopConfig,
  signal: AbortSignal | undefined,
  emit: AgentEventSink
): Promise<ExecutedToolBatch> {
  const isSequential =
    config.toolExecution === 'sequential' ||
    toolCalls.some((tc) => context.tools?.find((t) => t.name === tc.name)?.executionMode === 'sequential');

  const outcomes: FinalizedToolOutcome[] = [];
  const messages: any[] = [];

  for (const call of toolCalls) {
    if (signal?.aborted) break;

    await emit({
      type: 'tool_execution_start',
      toolCallId: call.id,
      toolName: call.name,
      args: call.arguments,
    });

    const tool = context.tools?.find((t) => t.name === call.name);
    let finalized: FinalizedToolOutcome;

    if (!tool) {
      finalized = {
        toolCall: call,
        result: { content: [{ type: 'text', text: `Tool "${call.name}" not found.` }] },
        isError: true,
      };
    } else {
      // Before tool call kancası (HITL, gate, argüman dönüştürme ve fail-closed)
      let blockedResult: BeforeToolCallResult | undefined;
      let effectiveArgs = call.arguments;
      if (config.beforeToolCall) {
        try {
          blockedResult = await config.beforeToolCall({ toolCall: call, args: effectiveArgs, context }, signal);
          if (blockedResult?.args) effectiveArgs = blockedResult.args;
        } catch (err: any) {
          blockedResult = { block: { reason: `before_tool failed: ${err?.message || String(err)}` } };
        }
      }

      if (blockedResult?.block) {
        const bObj = typeof blockedResult.block === 'object' ? blockedResult.block : null;
        finalized = {
          toolCall: call,
          result: {
            content: [{ type: 'text', text: bObj?.reason || blockedResult.reason || 'Tool execution was blocked' }],
            terminate: bObj?.terminate ?? blockedResult.terminate,
          },
          isError: true,
        };
      } else {
        try {
          const rawResult = await tool.execute(call.id, effectiveArgs, signal, (partial) => {
            void emit({
              type: 'tool_execution_update',
              toolCallId: call.id,
              toolName: call.name,
              args: effectiveArgs,
              partialResult: partial,
            });
          });

          let result = rawResult;
          let isError = false;

          if (config.afterToolCall) {
            const afterRes = await config.afterToolCall(
              { toolCall: call, args: effectiveArgs, result: rawResult, isError, context },
              signal
            );
            if (afterRes) {
              result = {
                ...result,
                content: afterRes.content ?? result.content,
                details: afterRes.details ?? result.details,
                terminate: afterRes.terminate ?? result.terminate,
              };
              isError = afterRes.isError ?? isError;
            }
          }

          finalized = { toolCall: call, result, isError };
        } catch (err: any) {
          finalized = {
            toolCall: call,
            result: { content: [{ type: 'text', text: err?.message || String(err) }] },
            isError: true,
          };
        }
      }
    }

    await emit({
      type: 'tool_execution_end',
      toolCallId: call.id,
      toolName: call.name,
      result: finalized.result,
      isError: finalized.isError,
    });

    const toolResultMsg = {
      role: 'toolResult',
      toolCallId: call.id,
      toolName: call.name,
      content: finalized.result.content ?? [],
      details: finalized.result.details,
      isError: finalized.isError,
      timestamp: Date.now(),
    };

    await emit({ type: 'message_start', message: toolResultMsg });
    await emit({ type: 'message_end', message: toolResultMsg });

    outcomes.push(finalized);
    messages.push(toolResultMsg);
  }

  const terminate = outcomes.length > 0 && outcomes.some((o) => o.result.terminate === true);
  const suspend = outcomes.length > 0 && outcomes.some((o) => o.result.suspend === true);
  return { messages, terminate, suspend };
}

async function failTruncatedCalls(toolCalls: AgentToolCall[], emit: AgentEventSink): Promise<ExecutedToolBatch> {
  const messages: any[] = [];
  for (const call of toolCalls) {
    await emit({
      type: 'tool_execution_start',
      toolCallId: call.id,
      toolName: call.name,
      args: call.arguments,
    });

    const result: AgentToolResult = {
      content: [
        {
          type: 'text',
          text: `Tool "${call.name}" was not executed: LLM hit token output limit. Re-issue with complete arguments.`,
        },
      ],
    };

    await emit({
      type: 'tool_execution_end',
      toolCallId: call.id,
      toolName: call.name,
      result,
      isError: true,
    });

    const msg = {
      role: 'toolResult',
      toolCallId: call.id,
      toolName: call.name,
      content: result.content,
      isError: true,
      timestamp: Date.now(),
    };

    await emit({ type: 'message_start', message: msg });
    await emit({ type: 'message_end', message: msg });
    messages.push(msg);
  }
  return { messages, terminate: false, suspend: false };
}
