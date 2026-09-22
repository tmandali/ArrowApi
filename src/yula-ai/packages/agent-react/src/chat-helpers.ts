import {
  piEventStream,
  executeComponentAction,
  sessionManager,
  agentUiTools,
} from '@my-agent/core';
import type { AgentToolInvocation } from './chat-types';

export function promptTextOf(
  msgOrContent?: { role?: 'user'; content?: string; text?: string; files?: any[]; parts?: any[] } | string,
  fallbackInput: string = '',
): string {
  if (!msgOrContent) return fallbackInput;
  if (typeof msgOrContent === 'string') return msgOrContent;
  if (msgOrContent.text) return msgOrContent.text;
  if (msgOrContent.content) return msgOrContent.content;
  if (Array.isArray(msgOrContent.parts)) {
    return msgOrContent.parts
      .filter((p) => p && p.type === 'text' && typeof p.text === 'string')
      .map((p) => p.text)
      .join('');
  }
  return '';
}

export async function executeAgentToolCall(
  toolCall: AgentToolInvocation,
  customRunner?: (params: { toolCall: AgentToolInvocation }) => Promise<any>,
): Promise<{ result: any; isError: boolean }> {
  const { toolName, toolCallId } = toolCall;
  const args = toolCall.args ?? {};

  piEventStream.emit({
    type: 'tool_execution_start',
    toolCallId,
    toolName,
    args,
  });

  let result: any;
  let isError = false;

  try {
    if (customRunner) {
      result = await customRunner({ toolCall });
    } else if (toolName === 'dispatch_component_action') {
      const res = await executeComponentAction({
        component_id: args.component_id,
        action: args.action,
        payload: args.payload,
        toolCallId,
      });
      result = res.success
        ? (res.details && typeof res.details === 'object'
            ? { message: res.message, ...res.details }
            : (res.details ?? res.message))
        : res.error;
      isError = !res.success;
    } else if (toolName in agentUiTools) {
      const toolDef = (agentUiTools as Record<string, any>)[toolName];
      const res = await toolDef.execute(args);
      result = res.success ? (res.message || JSON.stringify(res)) : res.error;
      isError = !res.success;
    } else {
      result = `Bilinmeyen araç: ${toolName}`;
      isError = true;
    }
  } catch (err: any) {
    result = err?.message || String(err);
    isError = true;
  }

  piEventStream.emit({
    type: 'tool_execution_end',
    toolCallId,
    toolName,
    result,
    isError,
  });

  return { result, isError };
}

export interface CachedModelsResult {
  models: any[];
  defaultModel?: string;
  defaultProvider?: string;
}

const modelsEndpointCache = new Map<string, CachedModelsResult>();
const inFlightModelsFetches = new Map<string, Promise<CachedModelsResult | null>>();

export function fetchModelsCached(endpoint: string): Promise<CachedModelsResult | null> {
  if (!endpoint) return Promise.resolve(null);
  const cached = modelsEndpointCache.get(endpoint);
  if (cached) return Promise.resolve(cached);

  const inFlight = inFlightModelsFetches.get(endpoint);
  if (inFlight) return inFlight;

  const promise = fetch(endpoint)
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => {
      if (data?.models && Array.isArray(data.models)) {
        const entry: CachedModelsResult = {
          models: data.models,
          defaultModel: data.defaultModel,
          defaultProvider: data.defaultProvider,
        };
        modelsEndpointCache.set(endpoint, entry);
        return entry;
      }
      return null;
    })
    .catch(() => null)
    .finally(() => {
      inFlightModelsFetches.delete(endpoint);
    });

  inFlightModelsFetches.set(endpoint, promise);
  return promise;
}
