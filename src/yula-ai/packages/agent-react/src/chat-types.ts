import type { ContextUsage, CompactionSettings, CompactionResult, AgentCommand } from '@my-agent/core';

export type { ContextUsage, CompactionSettings, CompactionResult, AgentCommand };

export interface AgentToolInvocation {
  toolCallId: string;
  toolName: string;
  args?: any;
  result?: any;
  state?: 'call' | 'result' | 'partial-call';
}

export interface AgentMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  toolInvocations?: AgentToolInvocation[];
  parts: any[];
  metadata?: Record<string, any>;
  createdAt?: Date;
}

export const messageTextOf = (m: any): string => {
  if (!m) return '';
  if (typeof m === 'string') return m;
  if (Array.isArray(m.parts)) {
    const textFromParts = m.parts
      .filter((p: any) => p && p.type === 'text' && typeof p.text === 'string')
      .map((p: any) => p.text)
      .join('');
    if (textFromParts) return textFromParts;
  }
  return typeof m.content === 'string' ? m.content : '';
};

export const textPart = (text: string) => [{ type: 'text' as const, text }];

export interface UseAgentChatOptions {
  model?: string;
  provider?: string;
  getAiConfig?: () => { provider?: string; endpoint?: string };
  locale?: import('@my-agent/core').AgentLocale;
  messages?: Partial<import('@my-agent/core').AgentDictionary>;
  apiEndpoint?: string;
  compactEndpoint?: string;
  modelsEndpoint?: string;
  initialMessages?: AgentMessage[];
  compactionSettings?: Partial<CompactionSettings>;
  onToolCall?: (params: { toolCall: AgentToolInvocation }) => Promise<any>;
  onFinish?: (message: AgentMessage) => void;
  onError?: (error: Error) => void;
  onCompaction?: (result: CompactionResult) => void;
  onOpenLogin?: (provider?: string) => void;
  onSelectModel?: (modelId: string, provider?: string) => void;
  onSelectProvider?: (provider: string) => void;
}
