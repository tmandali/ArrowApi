import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  uiEventBus,
  uiRegistry,
  UIContextSnapshot,
  piEventStream,
  sessionManager,
  compactContextSnapshot,
  telemetryTracker,
  promptTemplateManager,
  calculateContextUsage,
  shouldCompact,
  compactConversation,
  ContextUsage,
  modelCatalog,
  i18nManager,
  Agent,
  AgentSession,
  createStandardAgentTools,
  agentMemory,
  skillsManager,
  sessionHarness,
} from '@my-agent/core';

import { useAgentContext } from './agent-provider';
import {
  AgentMessage,
  UseAgentChatOptions,
} from './chat-types';
import { promptTextOf } from './chat-helpers';
import { handleBuiltInCommand } from './chat-commands';
import { createYulaStreamFn } from './chat-stream-fn';

export * from './chat-types';
export * from './chat-helpers';

export function useAgentChat(currentRoute: string = '/', options?: UseAgentChatOptions) {
  const agentCtx = useAgentContext();
  const apiEndpoint = options?.apiEndpoint ?? agentCtx.apiEndpoint;
  const compactEndpoint = options?.compactEndpoint ?? '/api/compact';
  const modelsEndpoint = options?.modelsEndpoint ?? agentCtx.modelsEndpoint ?? '/api/agent/models';
  const [messages, setMessages] = useState<AgentMessage[]>(options?.initialMessages || []);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [selectedModel, setSelectedModel] = useState<string | undefined>(options?.model);
  const [selectedProvider, setSelectedProvider] = useState<string | undefined>(options?.provider);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState<'ready' | 'submitted' | 'streaming' | 'error'>('ready');
  const [error, setError] = useState<Error | null>(null);

  // Context Doluluk & Compaction Durumu (Pi Reference)
  const [autoCompactEnabled, setAutoCompactEnabled] = useState(options?.compactionSettings?.enabled ?? true);
  const [isCompacting, setIsCompacting] = useState(false);
  const [contextUsage, setContextUsage] = useState<ContextUsage>(() =>
    calculateContextUsage(options?.initialMessages || [], options?.model)
  );

  const [availableModels, setAvailableModels] = useState<any[]>(() => modelCatalog.getAllModels());
  const [currentLocale, setCurrentLocale] = useState(options?.locale || agentCtx.locale || i18nManager.getLocale());

  const abortControllerRef = useRef<AbortController | null>(null);
  const currentRouteRef = useRef(currentRoute);
  currentRouteRef.current = currentRoute;

  useEffect(() => {
    if (options?.locale) i18nManager.setLocale(options.locale);
  }, [options?.locale]);

  useEffect(() => {
    if (options?.messages) i18nManager.setOverrides(options.messages);
  }, [options?.messages]);

  useEffect(() => {
    return i18nManager.subscribe((_, loc) => setCurrentLocale(loc));
  }, []);

  useEffect(() => {
    fetch(modelsEndpoint)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.models && Array.isArray(data.models)) {
          setAvailableModels(data.models);
          if (!selectedModel && data.defaultModel) setSelectedModel(data.defaultModel);
          if (!selectedProvider && data.defaultProvider) setSelectedProvider(data.defaultProvider);
        }
      })
      .catch(() => {});
  }, [modelsEndpoint]);

  const selectModel = useCallback(
    (modelId: string, provider?: string) => {
      setSelectedModel(modelId);
      let resolvedProvider = provider;
      if (!resolvedProvider) {
        const found = availableModels.find((m) => m.id === modelId || m.modelId === modelId);
        if (found?.provider) resolvedProvider = found.provider;
      }
      if (resolvedProvider) setSelectedProvider(resolvedProvider);
      options?.onSelectModel?.(modelId, resolvedProvider);
    },
    [availableModels, options]
  );

  useEffect(() => {
    setContextUsage(calculateContextUsage(messages, selectedModel));
  }, [messages, selectedModel]);

  useEffect(() => {
    setCanUndo(sessionManager.canUndo());
    setCanRedo(sessionManager.canRedo());
    return sessionManager.subscribe(() => {
      setCanUndo(sessionManager.canUndo());
      setCanRedo(sessionManager.canRedo());
    });
  }, []);

  const getContextSnapshot = useCallback((): UIContextSnapshot => {
    const raw: UIContextSnapshot = {
      route: currentRouteRef.current,
      active_components: uiRegistry.getActiveComponents(),
      recent_events: uiEventBus.getRecentEvents(),
    };
    return compactContextSnapshot(raw);
  }, []);

  // Pi Reference: Otomatik / Manuel Context Compaction Motoru
  const compact = useCallback(
    async (customInstructions?: string, reason: 'threshold' | 'overflow' | 'manual' = 'manual'): Promise<boolean> => {
      if (messages.length <= 1 || isCompacting) return false;
      setIsCompacting(true);
      try {
        const { compactedMessages, result } = await compactConversation({
          messages,
          modelId: selectedModel,
          settings: { enabled: autoCompactEnabled, ...options?.compactionSettings },
          customInstructions,
          reason,
          summarizeFn: async (serialized) => {
            try {
              const resp = await fetch(compactEndpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  serializedText: serialized,
                  model: selectedModel,
                  provider: selectedProvider,
                  customInstructions,
                }),
              });
              if (resp.ok) {
                const data = await resp.json();
                if (data.summary) return data.summary;
              }
            } catch {}
            return '';
          },
        });

        if (result.compactedMessagesCount > 0) {
          setMessages(compactedMessages);
          setContextUsage(calculateContextUsage(compactedMessages, selectedModel));
          options?.onCompaction?.(result);
          return true;
        }
        return false;
      } catch (err) {
        console.error('[Context Compaction Error]:', err);
        return false;
      } finally {
        setIsCompacting(false);
      }
    },
    [messages, isCompacting, selectedModel, selectedProvider, autoCompactEnabled, options, compactEndpoint]
  );

  // Pi Autonomous Agent Engine & Session Instances
  const agentRef = useRef<Agent | null>(null);
  const sessionRef = useRef<AgentSession | null>(null);

  const streamFn = useMemo(() => {
    return createYulaStreamFn({
      endpoint: apiEndpoint,
      getContextSnapshot,
      onAssistantUpdate: (partial) => {
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last && last.role === 'assistant') {
            return [...prev.slice(0, -1), { ...last, ...partial }];
          }
          return [...prev, partial];
        });
      },
    });
  }, [apiEndpoint, getContextSnapshot]);

  if (!agentRef.current) {
    agentRef.current = new Agent({
      initialMessages: messages,
      tools: createStandardAgentTools(),
      streamFn,
      model: selectedModel,
      maxIterations: 15,
      shouldStopAfterTurn: (ctx) => {
        // ask_user_choice tetiklendiyse veya terminate bayrağı varsa dur
        const hasTerminate = ctx.toolResults?.some((tr: any) => tr?.terminate === true);
        return hasTerminate;
      },
    });

    sessionRef.current = new AgentSession({
      agent: agentRef.current,
      autoCompaction: autoCompactEnabled,
      compactionSettings: options?.compactionSettings,
      onSaveMessages: (updated) => {
        setMessages([...updated]);
      },
    });

    sessionRef.current.subscribe((event) => {
      piEventStream.emit(event as any);
      if (event.type === 'turn_start' || event.type === 'session_start') {
        setStatus('streaming');
        telemetryTracker.startTurn();
      } else if (event.type === 'turn_end') {
        telemetryTracker.endTurn(0, 0);
      } else if (event.type === 'compaction_start') {
        setIsCompacting(true);
      } else if (event.type === 'compaction_end') {
        setIsCompacting(false);
      }
    });
  }

  // Model veya araç değiştiğinde agent state'ini güncelle
  useEffect(() => {
    if (agentRef.current) {
      agentRef.current.model = selectedModel;
      agentRef.current.options.streamFn = streamFn;
    }
  }, [selectedModel, streamFn]);

  const newConversation = useCallback(() => {
    setMessages([]);
    if (agentRef.current) agentRef.current.messages = [];
  }, []);

  const appendSystemMessage = useCallback((content: string) => {
    const sysMsg: AgentMessage = {
      id: `sys_${Date.now()}`,
      role: 'assistant',
      content,
      parts: [{ type: 'text', text: content }],
      createdAt: new Date(),
    };
    setMessages((prev) => [...prev, sysMsg]);
  }, []);

  // Pi Autonomous Loop Gönderim Fonksiyonu (Continuous While Loop)
  const sendMessage = useCallback(
    async (
      msgOrContent?: { role?: 'user'; content?: string; text?: string; files?: any[]; parts?: any[] } | string
    ) => {
      const promptText = promptTextOf(msgOrContent, input);
      if (!promptText.trim()) return;

      // Pi Reference: Slash Command check
      if (promptTemplateManager.isSystemCommand(promptText)) {
        const res = promptTemplateManager.resolveInput(promptText);
        setInput('');
        const handled = await handleBuiltInCommand(res.command!, res.args || [], {
          availableModels,
          selectedProvider,
          selectedModel,
          selectModel,
          newConversation,
          compact,
          onOpenLogin: options?.onOpenLogin,
          appendSystemMessage,
        });
        if (handled) return;
      }

      const userMsg: AgentMessage = {
        id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        role: 'user',
        content: promptText,
        parts: [{ type: 'text', text: promptText }],
        createdAt: new Date(),
      };

      setMessages((prev) => [...prev, userMsg]);
      setInput('');
      setIsLoading(true);
      setStatus('submitted');
      setError(null);

      const ac = new AbortController();
      abortControllerRef.current = ac;

      try {
        if (!agentRef.current) return;
        agentRef.current.messages = [...messages, userMsg];

        // Otonom ReAct Döngüsünü Başlat
        const newTurns = sessionRef.current
          ? await sessionRef.current.prompt([userMsg])
          : await agentRef.current.run([userMsg], ac.signal);
        setMessages((prev) => {
          // Çakışan mesajları filtrele ve yeni turları transkripte bağla
          const existingIds = new Set(prev.map((m) => m.id));
          const additions = newTurns.filter((nt) => !existingIds.has(nt.id));
          return [...prev, ...additions];
        });

        const lastAssistant = newTurns.reverse().find((m) => m.role === 'assistant');
        if (lastAssistant) {
          options?.onFinish?.(lastAssistant);
        }

        // Compaction kontrolü
        const updatedUsage = calculateContextUsage([...messages, ...newTurns], selectedModel);
        setContextUsage(updatedUsage);
        if (autoCompactEnabled && shouldCompact(updatedUsage.tokens, updatedUsage.contextWindow, options?.compactionSettings)) {
          setTimeout(() => compact(undefined, 'threshold'), 150);
        }
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          setError(err);
          setStatus('error');
          options?.onError?.(err);
        }
      } finally {
        setIsLoading(false);
        setStatus('ready');
        abortControllerRef.current = null;
      }
    },
    [input, availableModels, selectedProvider, selectedModel, selectModel, newConversation, compact, options, appendSystemMessage, messages, autoCompactEnabled]
  );

  const stop = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    if (sessionRef.current) {
      sessionRef.current.abort();
    } else if (agentRef.current) {
      agentRef.current.abort();
    }
    setIsLoading(false);
    setStatus('ready');
  }, []);

  const steer = useCallback((text: string) => {
    if (sessionRef.current) {
      sessionRef.current.steer(text);
    } else if (agentRef.current) {
      agentRef.current.steer(text);
    }
  }, []);

  const followUp = useCallback((text: string) => {
    if (sessionRef.current) {
      sessionRef.current.followUp(text);
    } else if (agentRef.current) {
      agentRef.current.followUp(text);
    }
  }, []);

  const regenerate = useCallback(async () => {
    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    if (lastUser) {
      const text = lastUser.content || '';
      const filtered = messages.slice(0, messages.indexOf(lastUser));
      setMessages(filtered);
      if (agentRef.current) agentRef.current.messages = filtered;
      await sendMessage(text);
    }
  }, [messages, sendMessage]);

  return {
    messages,
    setMessages,
    input,
    setInput,
    sendMessage,
    stop,
    regenerate,
    isLoading,
    status,
    error,
    steer,
    followUp,
    compact,
    canUndo,
    canRedo,
    contextUsage,
    autoCompactEnabled,
    setAutoCompactEnabled,
    isCompacting,
    selectedModel,
    selectedProvider,
    selectModel,
    availableModels,
    currentLocale,
    executeCommand: (cmd: string, ...args: string[]) =>
      handleBuiltInCommand(cmd, args, {
        availableModels,
        selectedProvider,
        selectedModel,
        selectModel,
        newConversation,
        compact,
        onOpenLogin: options?.onOpenLogin,
        appendSystemMessage,
      }),
    handleInputChange: (e: any) => setInput(e?.target?.value ?? String(e ?? '')),
    handleSubmit: (e?: any) => {
      e?.preventDefault?.();
      sendMessage();
    },
    runSlashCommand: (cmd: string) =>
      handleBuiltInCommand(cmd, [], {
        availableModels,
        selectedProvider,
        selectedModel,
        selectModel,
        newConversation,
        compact,
        onOpenLogin: options?.onOpenLogin,
        appendSystemMessage,
      }),
    undo: () => sessionManager.undo(),
    redo: () => sessionManager.redo(),
    activeSkills: skillsManager.getActiveSkills(),
    templates: promptTemplateManager.getAll(),
    newConversation,
    dumpSession: () => sessionHarness.dumpSession(messages, { route: currentRouteRef.current }),
    restoreSession: (dump: any) => sessionHarness.restoreSession(dump),
    remember: (k: string, v: any, s?: any) => agentMemory.remember(k, v, s),
    forget: (k: string) => agentMemory.forget(k),
    getMemories: () => agentMemory.getAll(),
    chooseOption: (choice: string) => sendMessage(choice),
    addToolOutput: ({ toolCallId, output }: { toolCallId: string; output: unknown }) => {
      setMessages((prev) =>
        prev.map((msg) => {
          if (msg.role !== 'assistant' || !Array.isArray(msg.parts)) return msg;
          const hasTarget = msg.parts.some(
            (p: any) => p && typeof p === 'object' && p.toolCallId === toolCallId,
          );
          if (!hasTarget) return msg;
          return {
            ...msg,
            parts: msg.parts.map((p: any) =>
              p && typeof p === 'object' && p.toolCallId === toolCallId
                ? { ...p, state: 'output-available', output }
                : p,
            ),
          };
        }),
      );
    },
  };

}
