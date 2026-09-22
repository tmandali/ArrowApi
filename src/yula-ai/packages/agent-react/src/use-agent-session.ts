/**
 * useAgentSession - Saf Reaktif Sunum Kancası (Pure Pi Presentation Hook)
 *
 * Pi'nin Presentation Layer ve ExtensionUI standartlarına tam uyumludur.
 * Vercel AI SDK taklidi stateless while-fetch döngüsü barındırmaz.
 * Doğrudan AgentSession nesnesinin EventStream akışına abone olur,
 * gelen UI delegasyon taleplerini (dispatch_component_action, ask_user_choice)
 * React bileşen katmanında çözer ve sonucu oturuma anında iletir.
 */

import * as React from 'react';
import {
  AgentSession,
  agentHarness,
  delegatedToolRegistry,
  executeComponentAction,
  uiRegistry,
  uiEventBus,
  type AgentSessionEvent,
  type AgentSessionState,
  type DelegatedUIRequest,
  type DelegatedUIResponse,
} from '@my-agent/core';

export interface PendingUserChoice {
  id: string;
  question: string;
  options: Array<string | { label: string; value?: string; description?: string }>;
  allowCustom?: boolean;
  customPlaceholder?: string;
}

export interface UseAgentSessionOptions {
  session?: AgentSession;
  createSession?: () => AgentSession;
  initialMessages?: any[];
  onCompaction?: (result: any) => void;
  onError?: (error: Error) => void;
}

export function useAgentSession(options: UseAgentSessionOptions = {}) {
  // 1. Session Instance Yönetimi
  const sessionRef = React.useRef<AgentSession | null>(null);

  if (!sessionRef.current) {
    if (options.session) {
      sessionRef.current = options.session;
    } else if (options.createSession) {
      sessionRef.current = options.createSession();
    }
  }

  const session = sessionRef.current;

  // 2. Reaktif Durumlar
  const [messages, setMessages] = React.useState<any[]>(() => {
    return session ? session.getMessages() : options.initialMessages || [];
  });

  const [status, setStatus] = React.useState<'idle' | 'running' | 'compacting'>('idle');
  const [isStreaming, setIsStreaming] = React.useState(false);
  const [streamingMessage, setStreamingMessage] = React.useState<any | null>(null);
  const [pendingChoice, setPendingChoice] = React.useState<PendingUserChoice | null>(null);
  const [sessionState, setSessionState] = React.useState<AgentSessionState | null>(() => {
    return session ? session.getState() : null;
  });
  const [toolUpdates, setToolUpdates] = React.useState<Record<string, any>>({});
  const [retryState, setRetryState] = React.useState<{
    isRetrying: boolean;
    attempt: number;
    maxAttempts: number;
    delayMs: number;
    errorMessage: string;
  } | null>(null);

  // Seçim kartı için bekleyen çözümleyici referansı
  const pendingChoiceResolverRef = React.useRef<{
    id: string;
    resolve: (res: DelegatedUIResponse) => void;
  } | null>(null);

  // 3. UI Delegasyon İşleyicisi (Pi ExtensionUI Modeli)
  React.useEffect(() => {
    const unregister = delegatedToolRegistry.registerHandler(
      async (req: DelegatedUIRequest): Promise<DelegatedUIResponse | void> => {
        // A. Bileşen Eylemi (SET_FIELDS, NAVIGATE, RUN, vs.)
        if (req.method === 'dispatch_component_action') {
          const p = req.payload as any;
          const res = await executeComponentAction({
            component_id: String(p?.component_id ?? ''),
            action: String(p?.action ?? ''),
            payload: p?.payload ?? {},
            toolCallId: req.id,
          });

          return {
            id: req.id,
            success: res.success,
            result: res,
            error: res.error,
          };
        }

        // B. Inline HITL Seçim Kartı (ask_user_choice)
        if (req.method === 'ask_user_choice') {
          const p = req.payload as any;
          return new Promise<DelegatedUIResponse>((resolve) => {
            pendingChoiceResolverRef.current = { id: req.id, resolve };
            setPendingChoice({
              id: req.id,
              question: p?.question ?? 'Lütfen bir seçim yapınız:',
              options: p?.options ?? [],
              allowCustom: p?.allow_custom ?? true,
              customPlaceholder: p?.custom_placeholder,
            });
          });
        }

        // C. UI Durum İncelemesi (inspect_ui_state)
        if (req.method === 'inspect_ui_state') {
          return {
            id: req.id,
            success: true,
            result: {
              active_components: uiRegistry.getActiveComponents(),
              recent_events: uiEventBus.getRecentEvents(),
            },
          };
        }
      },
    );

    return () => {
      unregister();
    };
  }, []);

  // 4. Session Olaylarına Reaktif Abonelik
  React.useEffect(() => {
    if (!session) return;

    const syncState = () => {
      setMessages([...session.getMessages()]);
      setSessionState(session.getState());
    };

    const unsubscribe = session.subscribe((event: AgentSessionEvent) => {
      if (event.type === 'session_start' || event.type === 'agent_start') {
        setStatus('running');
        setIsStreaming(true);
        syncState();
      } else if (event.type === 'message_start' || event.type === 'message_end' || event.type === 'turn_end') {
        syncState();
      } else if (event.type === 'compaction_start') {
        setStatus('compacting');
      } else if (event.type === 'compaction_end') {
        setStatus(session.agent.state.isStreaming ? 'running' : 'idle');
        syncState();
        if ('result' in event && event.result && options.onCompaction) {
          options.onCompaction(event.result);
        }
      } else if (event.type === 'agent_end') {
        setStatus('idle');
        setIsStreaming(false);
        setStreamingMessage(null);
        syncState();
      } else if (event.type === 'queue_update') {
        setSessionState(session.getState());
      } else if (event.type === 'tool_execution_start') {
        setToolUpdates((prev) => ({
          ...prev,
          [event.toolCallId]: { status: 'running', toolName: event.toolName },
        }));
      } else if (event.type === 'tool_execution_update') {
        setToolUpdates((prev) => ({
          ...prev,
          [event.toolCallId]: { ...(prev[event.toolCallId] || {}), partialResult: event.partialResult },
        }));
      } else if (event.type === 'tool_execution_end') {
        setToolUpdates((prev) => ({
          ...prev,
          [event.toolCallId]: { ...(prev[event.toolCallId] || {}), status: 'ended', isError: event.isError },
        }));
      } else if (event.type === 'auto_retry_start') {
        setRetryState({
          isRetrying: true,
          attempt: event.attempt,
          maxAttempts: event.maxAttempts,
          delayMs: event.delayMs,
          errorMessage: event.errorMessage,
        });
      } else if (event.type === 'auto_retry_end') {
        setRetryState(null);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [session, options.onCompaction]);

  // 5. Kullanıcı Eylem Fonksiyonları
  const sendMessage = React.useCallback(
    async (input: string | any) => {
      if (!session) throw new Error('No active AgentSession configured.');
      setStatus('running');
      setIsStreaming(true);
      try {
        const res = await session.prompt(input);
        setMessages([...res]);
        return res;
      } catch (err: any) {
        setStatus('idle');
        setIsStreaming(false);
        if (options.onError) {
          options.onError(err);
        }
        throw err;
      }
    },
    [session, options.onError],
  );

  const steer = React.useCallback(
    (message: string) => {
      if (!session) return;
      session.steer(message);
      setSessionState(session.getState());
    },
    [session],
  );

  const followUp = React.useCallback(
    (message: string) => {
      if (!session) return;
      session.followUp(message);
      setSessionState(session.getState());
    },
    [session],
  );

  const abort = React.useCallback(() => {
    if (!session) return;
    session.abort();
    if (pendingChoiceResolverRef.current) {
      pendingChoiceResolverRef.current.resolve({
        id: pendingChoiceResolverRef.current.id,
        success: false,
        cancelled: true,
        error: 'Choice aborted',
      });
      pendingChoiceResolverRef.current = null;
      setPendingChoice(null);
    }
    setStatus('idle');
    setIsStreaming(false);
    setSessionState(session.getState());
  }, [session]);

  const respondToChoice = React.useCallback((value: string) => {
    if (pendingChoiceResolverRef.current) {
      const resolver = pendingChoiceResolverRef.current;
      pendingChoiceResolverRef.current = null;
      setPendingChoice(null);
      resolver.resolve({
        id: resolver.id,
        success: true,
        result: { value, selected: true },
      });
    } else if (session) {
      session.steer(value);
      setSessionState(session.getState());
    }
  }, [session]);

  const clearQueue = React.useCallback(() => {
    if (!session) return { steering: [], followUp: [] };
    const res = session.clearQueue();
    setSessionState(session.getState());
    return res;
  }, [session]);

  const compact = React.useCallback(
    async (customInstructions?: string) => {
      if (!session) return null;
      setStatus('compacting');
      try {
        const res = await session.compact(customInstructions);
        setMessages([...session.getMessages()]);
        return res;
      } finally {
        setStatus(session.agent.state.isStreaming ? 'running' : 'idle');
      }
    },
    [session],
  );

  const fork = React.useCallback(
    (messageId?: string) => {
      if (!session) return null;
      return session.fork(messageId);
    },
    [session],
  );

  const clone = React.useCallback(() => {
    if (!session) return null;
    return session.clone();
  }, [session]);

  const exportHtml = React.useCallback(
    (uiState?: Record<string, any>) => {
      if (!session) return '';
      return session.exportHtml(uiState);
    },
    [session],
  );

  const dump = React.useCallback(() => {
    if (!session) return null;
    return session.dump();
  }, [session]);

  return {
    session,
    harness: session?.harness ?? agentHarness,
    messages,
    status,
    isStreaming,
    streamingMessage,
    pendingChoice,
    sessionState,
    toolUpdates,
    retryState,
    sendMessage,
    steer,
    followUp,
    abort,
    respondToChoice,
    clearQueue,
    compact,
    fork,
    clone,
    exportHtml,
    dump,
    getState: () => session?.getState() ?? null,
  };
}
