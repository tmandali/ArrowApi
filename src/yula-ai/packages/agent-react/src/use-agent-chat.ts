import { useState, useEffect, useRef, useCallback } from 'react';
import {
  uiEventBus,
  uiRegistry,
  UIContextSnapshot,
  piEventStream,
  steeringManager,
  sessionManager,
  compactContextSnapshot,
  telemetryTracker,
  promptTemplateManager,
  skillsManager,
  agentMemory,
  sessionHarness,
  SessionDump,
  calculateContextUsage,
  shouldCompact,
  compactConversation,
  DEFAULT_COMPACTION_SETTINGS,
  ContextUsage,
  CompactionSettings,
  CompactionResult,
  modelCatalog,
  i18nManager,
} from '@my-agent/core';
import { useAgentContext } from './agent-provider';
import {
  AgentMessage,
  AgentToolInvocation,
  UseAgentChatOptions,
  messageTextOf,
  textPart,
} from './chat-types';
import { promptTextOf, executeAgentToolCall } from './chat-helpers';

export * from './chat-types';
export * from './chat-helpers';

export function useAgentChat(currentRoute: string = '/', options?: UseAgentChatOptions) {
  const agentCtx = useAgentContext();
  const apiEndpoint = options?.apiEndpoint ?? agentCtx.apiEndpoint;
  const compactEndpoint = options?.compactEndpoint ?? '/api/compact';
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

  // Pi Reference: Model ve Sağlayıcı Yönetimi
  const [availableModels, setAvailableModels] = useState<any[]>(() => modelCatalog.getAllModels());

  const [currentLocale, setCurrentLocale] = useState(options?.locale || agentCtx.locale || i18nManager.getLocale());

  useEffect(() => {
    if (options?.locale) {
      i18nManager.setLocale(options.locale);
    }
  }, [options?.locale]);

  useEffect(() => {
    if (options?.messages) {
      i18nManager.setOverrides(options.messages);
    }
  }, [options?.messages]);

  useEffect(() => {
    const unsub = i18nManager.subscribe((_, loc) => {
      setCurrentLocale(loc);
    });
    return unsub;
  }, []);

  useEffect(() => {
    fetch('/api/models')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.models && Array.isArray(data.models)) {
          setAvailableModels(data.models);
          if (!selectedModel && data.defaultModel) {
            setSelectedModel(data.defaultModel);
          }
          if (!selectedProvider && data.defaultProvider) {
            setSelectedProvider(data.defaultProvider);
          }
        }
      })
      .catch(() => {});
  }, []);

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
    [availableModels, options?.onSelectModel],
  );

  const abortControllerRef = useRef<AbortController | null>(null);
  const currentRouteRef = useRef(currentRoute);
  currentRouteRef.current = currentRoute;

  // Mesajlar veya model güncellendiğinde context doluluğunu yeniden hesapla
  useEffect(() => {
    setContextUsage(calculateContextUsage(messages, selectedModel));
  }, [messages, selectedModel]);

  useEffect(() => {
    if (options?.model !== undefined) {
      setSelectedModel(options.model);
    }
  }, [options?.model]);

  useEffect(() => {
    setCanUndo(sessionManager.canUndo());
    setCanRedo(sessionManager.canRedo());
  }, []);

  const getContextSnapshot = useCallback((): UIContextSnapshot => {
    const raw: UIContextSnapshot = {
      route: currentRouteRef.current,
      active_components: uiRegistry.getActiveComponents(),
      recent_events: uiEventBus.getRecentEvents(),
    };
    return compactContextSnapshot(raw);
  }, []);

  const executeToolCall = useCallback(
    async (toolCall: AgentToolInvocation) => {
      const res = await executeAgentToolCall(toolCall, options?.onToolCall);
      setCanUndo(sessionManager.canUndo());
      setCanRedo(sessionManager.canRedo());
      return res;
    },
    [options?.onToolCall],
  );

  // Pi Reference: Otomatik / Manuel Context Compaction Motoru
  const compact = useCallback(
    async (customInstructions?: string, reason: 'threshold' | 'overflow' | 'manual' = 'manual'): Promise<boolean> => {
      if (messages.length <= 1 || isCompacting) return false;
      setIsCompacting(true);
      try {
        const { compactedMessages, result } = await compactConversation({
          messages,
          modelId: selectedModel,
          settings: {
            enabled: autoCompactEnabled,
            ...options?.compactionSettings,
          },
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
            } catch {
              // Sunucu özetleme API'si yoksa yerel özet üreticiye devret
            }
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
    [messages, isCompacting, selectedModel, selectedProvider, autoCompactEnabled, options, compactEndpoint],
  );

  // Pi Reference: Built-in Sistem Komutları İcracısı (/new, /model, /login, /compact, /help)
  const executeCommand = useCallback(
    async (commandName: string, ...args: string[]): Promise<boolean> => {
      const cmd = commandName.startsWith('/') ? commandName : `/${commandName}`;

      if (cmd === '/new') {
        newConversation();
        const sysMsg: AgentMessage = {
          id: `sys_${Date.now()}`,
          role: 'assistant',
          content: '🧹 Oturum temizlendi ve yeni bir konuşma başlatıldı.',
          parts: [{ type: 'text', text: '🧹 Oturum temizlendi ve yeni bir konuşma başlatıldı.' }],
          createdAt: new Date(),
        };
        setMessages([sysMsg]);
        return true;
      }

      if (cmd === '/model') {
        if (args.length === 0) {
          const modelList = availableModels
            .map((m) => `- \`${m.id || m.modelId}\` (${m.provider || 'default'}${m.contextWindow ? ` - ${Math.round(m.contextWindow / 1000)}k` : ''})`)
            .join('\n');
          const content = `⚡ **Aktif Model:** \`${selectedProvider || 'openai'} / ${selectedModel || 'gpt-4o-mini'}\`\n\n**Kullanılabilir Modeller:**\n${modelList}\n\n*Model değiştirmek için \`/model <model-id>\` yazabilir veya başlıktaki seçiciyi kullanabilirsiniz.*`;
          const sysMsg: AgentMessage = {
            id: `sys_${Date.now()}`,
            role: 'assistant',
            content,
            parts: [{ type: 'text', text: content }],
            createdAt: new Date(),
          };
          setMessages((prev) => [...prev, sysMsg]);
          return true;
        }

        const targetModelId = args[0];
        selectModel(targetModelId);
        const content = `⚡ Aktif model başarıyla değiştirildi: **${targetModelId}**`;
        const sysMsg: AgentMessage = {
          id: `sys_${Date.now()}`,
          role: 'assistant',
          content,
          parts: [{ type: 'text', text: content }],
          createdAt: new Date(),
        };
        setMessages((prev) => [...prev, sysMsg]);
        return true;
      }

      if (cmd === '/login') {
        options?.onOpenLogin?.(args[0]);
        const content = '🔑 Sağlayıcı kimlik doğrulama penceresi (OAuth / API Key) açıldı.';
        const sysMsg: AgentMessage = {
          id: `sys_${Date.now()}`,
          role: 'assistant',
          content,
          parts: [{ type: 'text', text: content }],
          createdAt: new Date(),
        };
        setMessages((prev) => [...prev, sysMsg]);
        return true;
      }

      if (cmd === '/compact') {
        await compact(args.join(' '), 'manual');
        return true;
      }

      if (cmd === '/help' || cmd === '/yardim') {
        const allCmds = promptTemplateManager.getAll();
        const sysList = allCmds
          .filter((c) => c.category === 'system')
          .map((c) => `- \`${c.command}${c.argumentHint ? ' ' + c.argumentHint : ''}\`: ${c.description}`)
          .join('\n');
        const tplList = allCmds
          .filter((c) => c.category === 'template')
          .map((c) => `- \`${c.command}${c.argumentHint ? ' ' + c.argumentHint : ''}\`: ${c.description}`)
          .join('\n');

        const content = `### 🤖 Hazır Pi Sistem ve Şablon Komutları\n\n**Sistem Eylemleri (Yerel):**\n${sysList}\n\n**Hızlı Prompt Şablonları:**\n${tplList}`;
        const sysMsg: AgentMessage = {
          id: `sys_${Date.now()}`,
          role: 'assistant',
          content,
          parts: [{ type: 'text', text: content }],
          createdAt: new Date(),
        };
        setMessages((prev) => [...prev, sysMsg]);
        return true;
      }

      return false;
    },
    [availableModels, selectedProvider, selectedModel, selectModel, options?.onOpenLogin, compact],
  );

  // Ana mesaj gönderme ve akış okuma motoru (Vercel SDK'sız saf fetch)
  const sendMessage = async (
    msgOrContent?: { role?: 'user'; content?: string; text?: string; files?: any[]; parts?: any[] } | string,
  ) => {
    const promptText = promptTextOf(msgOrContent, input);
    if (!promptText.trim()) return;

    // Pi Reference: Built-in Sistem Komutu Kontrolü
    if (promptTemplateManager.isSystemCommand(promptText)) {
      const res = promptTemplateManager.resolveInput(promptText);
      setInput('');
      const handled = await executeCommand(res.command!, ...(res.args || []));
      if (handled) return;
    }

    const userMsg: AgentMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      role: 'user',
      content: promptText,
      parts: textPart(promptText),
      createdAt: new Date(),
    };

    const newHistory = [...messages, userMsg];
    setMessages(newHistory);
    setInput('');
    setIsLoading(true);
    setStatus('streaming');
    setError(null);

    // Pi Yaşam Döngüsü Başlatma
    telemetryTracker.startTurn();
    piEventStream.emit({ type: 'agent_start', prompt: promptText });
    piEventStream.emit({ type: 'turn_start', turnIndex: 0 });
    piEventStream.emit({ type: 'message_start', message: { role: 'user', content: promptText } });
    piEventStream.emit({ type: 'message_end', message: { role: 'user', content: promptText } });

    const assistantMsgId = `asst_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const assistantMsg: AgentMessage = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      parts: [],
      toolInvocations: [],
      createdAt: new Date(),
    };

    setMessages((prev) => [...prev, assistantMsg]);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newHistory,
          uiContext: getContextSnapshot(),
          model: selectedModel,
          provider: selectedProvider,
        }),
        signal: abortController.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let accumulatedText = '';
      const toolInvocations: AgentToolInvocation[] = [];
      const assistantParts: any[] = [];
      let streamUsage: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
        inputTokens: number;
        outputTokens: number;
      } | undefined;

      if (reader) {
        let done = false;
        let buffer = '';

        while (!done) {
          const { value, done: streamDone } = await reader.read();
          done = streamDone;
          if (value) {
            buffer += decoder.decode(value, { stream: !done });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed) continue;

              // 1. Vercel legacy data stream (0:"...")
              if (trimmed.startsWith('0:')) {
                try {
                  const chunk = JSON.parse(trimmed.slice(2));
                  if (typeof chunk === 'string') {
                    accumulatedText += chunk;
                  } else if (chunk && typeof chunk === 'object') {
                    const delta = chunk.delta ?? chunk.textDelta ?? chunk.text ?? '';
                    if (typeof delta === 'string') accumulatedText += delta;
                  }
                } catch {
                  accumulatedText += trimmed.slice(2);
                }
              } else if (trimmed.startsWith('d:') || trimmed.startsWith('e:')) {
                try {
                  const fin = JSON.parse(trimmed.slice(2));
                  const u = fin?.usage;
                  if (u) {
                    const pTok = u.promptTokens ?? u.inputTokens ?? 0;
                    const cTok = u.completionTokens ?? u.outputTokens ?? 0;
                    const tTok = u.totalTokens ?? (pTok + cTok);
                    streamUsage = {
                      promptTokens: pTok,
                      completionTokens: cTok,
                      totalTokens: tTok,
                      inputTokens: pTok,
                      outputTokens: cTok,
                    };
                    assistantMsg.metadata = { ...assistantMsg.metadata, usage: streamUsage };
                  }
                } catch {}
              } else if (trimmed.startsWith('9:') || trimmed.startsWith('b:')) {
                // Tool çağrısı paketi
                try {
                  const callData = JSON.parse(trimmed.slice(2));
                  if (callData?.toolName) {
                    const toolCall: AgentToolInvocation = {
                      toolCallId: callData.toolCallId || `tc_${Date.now()}`,
                      toolName: callData.toolName,
                      args: callData.args || callData.input || {},
                      state: 'call',
                    };
                    toolInvocations.push(toolCall);
                    assistantParts.push({
                      type: `tool-${callData.toolName}`,
                      toolCallId: toolCall.toolCallId,
                      toolName: callData.toolName,
                      input: toolCall.args,
                      state: 'call',
                    });
                    const { result } = await executeToolCall(toolCall);
                    toolCall.result = result;
                    toolCall.state = 'result';
                    const part = assistantParts.find(p => p.toolCallId === toolCall.toolCallId);
                    if (part) {
                      part.output = result;
                      part.state = 'output-available';
                    }
                  }
                } catch {
                  // yok say
                }
              } else if (trimmed.startsWith('data:')) {
                const ssePayload = trimmed.slice(5).trim();
                if (ssePayload === '[DONE]') break;
                try {
                  const parsed = JSON.parse(ssePayload);
                  if (parsed?.type === 'text-delta') {
                    const delta = parsed.delta ?? parsed.textDelta ?? parsed.text ?? '';
                    if (typeof delta === 'string') accumulatedText += delta;
                  } else if (parsed?.type === 'finish-step' && parsed?.usage) {
                    const u = parsed.usage;
                    const pTok = u.inputTokens ?? u.promptTokens ?? 0;
                    const cTok = u.outputTokens ?? u.completionTokens ?? 0;
                    const tTok = u.totalTokens ?? (pTok + cTok);
                    streamUsage = {
                      promptTokens: pTok,
                      completionTokens: cTok,
                      totalTokens: tTok,
                      inputTokens: pTok,
                      outputTokens: cTok,
                    };
                    assistantMsg.metadata = { ...assistantMsg.metadata, usage: streamUsage };
                  } else if (parsed?.type === 'message-metadata') {
                    const u = parsed.messageMetadata?.usage || parsed.metadata?.usage;
                    if (u) {
                      const pTok = u.inputTokens ?? u.promptTokens ?? 0;
                      const cTok = u.outputTokens ?? u.completionTokens ?? 0;
                      const tTok = u.totalTokens ?? (pTok + cTok);
                      streamUsage = {
                        promptTokens: pTok,
                        completionTokens: cTok,
                        totalTokens: tTok,
                        inputTokens: pTok,
                        outputTokens: cTok,
                      };
                      assistantMsg.metadata = { ...assistantMsg.metadata, usage: streamUsage };
                    }
                  } else if (parsed?.type === 'tool-input-available' || parsed?.type === 'tool-call') {
                    const toolCall: AgentToolInvocation = {
                      toolCallId: parsed.toolCallId || `tc_${Date.now()}`,
                      toolName: parsed.toolName,
                      args: parsed.input || parsed.args || {},
                      state: 'call',
                    };
                    toolInvocations.push(toolCall);
                    assistantParts.push({
                      type: `tool-${parsed.toolName}`,
                      toolCallId: toolCall.toolCallId,
                      toolName: parsed.toolName,
                      input: toolCall.args,
                      state: 'call',
                    });
                    const { result } = await executeToolCall(toolCall);
                    toolCall.result = result;
                    toolCall.state = 'result';
                    const part = assistantParts.find((p) => p.toolCallId === toolCall.toolCallId);
                    if (part) {
                      part.output = result;
                      part.state = 'output-available';
                    }
                  } else if (parsed?.type === 'tool-output-available') {
                    const target = toolInvocations.find(t => t.toolCallId === parsed.toolCallId);
                    if (target) {
                      target.result = parsed.output;
                      target.state = 'result';
                    }
                    const partTarget = assistantParts.find(p => p.toolCallId === parsed.toolCallId);
                    if (partTarget) {
                      partTarget.output = parsed.output;
                      partTarget.state = 'output-available';
                    }
                  } else if (parsed?.choices?.[0]?.delta?.content) {
                    accumulatedText += parsed.choices[0].delta.content;
                  }
                } catch {
                  accumulatedText += ssePayload;
                }
              } else {
                accumulatedText += trimmed;
              }

              // Anlık assistant mesajını güncelle
              const textParts = accumulatedText ? [{ type: 'text' as const, text: accumulatedText }] : [];
              assistantMsg.content = accumulatedText;
              assistantMsg.parts = [...textParts, ...assistantParts];
              assistantMsg.toolInvocations = [...toolInvocations];
              if (streamUsage) {
                assistantMsg.metadata = { ...assistantMsg.metadata, usage: streamUsage };
              }
              setMessages((prev) =>
                prev.map((m) => (m.id === assistantMsgId ? { ...assistantMsg } : m)),
              );
            }
          }
        }
      }

      // Bitirme Olayları
      const estimatedPromptTokens = Math.round(JSON.stringify(newHistory).length / 4);
      const estimatedCompletionTokens = Math.round(accumulatedText.length / 4);
      const finalPromptTokens = streamUsage?.promptTokens ?? estimatedPromptTokens;
      const finalCompletionTokens = streamUsage?.completionTokens ?? estimatedCompletionTokens;
      telemetryTracker.endTurn(finalPromptTokens, finalCompletionTokens);

      piEventStream.emit({
        type: 'message_end',
        message: { role: 'assistant', content: accumulatedText },
      });
      piEventStream.emit({
        type: 'turn_end',
        message: assistantMsg,
        toolResults: toolInvocations.map((t) => t.result),
      });
      piEventStream.emit({ type: 'agent_end' });

      options?.onFinish?.(assistantMsg);

      // Pi Reference: Context Doluluk Güncellemesi ve Auto-Compaction Kontrolü
      const finalHistory = [...newHistory, assistantMsg];
      const updatedUsage = calculateContextUsage(finalHistory, selectedModel, streamUsage?.totalTokens);
      setContextUsage(updatedUsage);

      if (autoCompactEnabled && shouldCompact(updatedUsage.tokens, updatedUsage.contextWindow, options?.compactionSettings)) {
        setTimeout(() => {
          compact(undefined, 'threshold');
        }, 150);
      }

      // Steering / Follow-up kontrolü
      if (steeringManager.hasSteering()) {
        const next = steeringManager.popSteer();
        if (next) setTimeout(() => sendMessage(next.content), 100);
      } else if (steeringManager.hasFollowUp()) {
        const next = steeringManager.popFollowUp();
        if (next) setTimeout(() => sendMessage(next.content), 200);
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
  };

  const stop = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsLoading(false);
      setStatus('ready');
    }
  }, []);

  const handleSubmit = async (e?: React.FormEvent<HTMLFormElement>) => {
    if (e?.preventDefault) e.preventDefault();
    if (input.trim()) {
      const text = input.trim();
      if (promptTemplateManager.isSystemCommand(text)) {
        const res = promptTemplateManager.resolveInput(text);
        setInput('');
        await executeCommand(res.command!, ...(res.args || []));
        return;
      }
      const resolution = promptTemplateManager.resolveInput(text);
      const promptText = resolution.resolvedText;
      sendMessage(promptText);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setInput(e.target.value);
  };

  const runSlashCommand = async (name: string, ...args: string[]) => {
    if (promptTemplateManager.isSystemCommand(name)) {
      await executeCommand(name, ...args);
      return;
    }
    const expanded = promptTemplateManager.format(name, ...args);
    sendMessage(expanded);
  };

  const chooseOption = (option: string | { label: string; value?: string }) => {
    const text = typeof option === 'string' ? option : (option.value || option.label);
    if (!text) return;
    sendMessage(text);
  };

  const steer = (message: string) => steeringManager.steer(message);
  const followUp = (message: string) => steeringManager.followUp(message);

  const checkpoint = (label: string, state: Record<string, any>) => {
    const cp = sessionManager.checkpoint(label, state, currentRoute);
    setCanUndo(sessionManager.canUndo());
    setCanRedo(sessionManager.canRedo());
    return cp;
  };

  const undo = () => {
    const cp = sessionManager.undo();
    setCanUndo(sessionManager.canUndo());
    setCanRedo(sessionManager.canRedo());
    return cp;
  };

  const redo = () => {
    const cp = sessionManager.redo();
    setCanUndo(sessionManager.canUndo());
    setCanRedo(sessionManager.canRedo());
    return cp;
  };

  // Pi Session Harness Dinleyicileri
  useEffect(() => {
    const unsubReset = sessionHarness.onReset(() => setMessages([]));
    const unsubRestore = sessionHarness.onRestore((dump) => {
      if (Array.isArray(dump.messages)) {
        setMessages(dump.messages as AgentMessage[]);
      }
    });
    return () => {
      unsubReset();
      unsubRestore();
    };
  }, []);

  const newConversation = () => {
    setMessages([]);
    sessionHarness.newConversation();
  };

  const dumpSession = (currentUiState?: Record<string, any>): SessionDump => {
    const dump = sessionHarness.dumpSession(messages, currentUiState);
    sessionHarness.exportSessionToFile(dump);
    return dump;
  };

  const restoreSession = (dumpOrJson: string | SessionDump) => {
    return sessionHarness.restoreSession(dumpOrJson);
  };

  const remember = (key: string, value: any, scope: 'session' | 'persistent' = 'session', desc?: string) => {
    agentMemory.remember(key, value, scope, desc);
  };
  const recall = (key: string) => agentMemory.recall(key);
  const forget = (key: string) => agentMemory.forget(key);
  const getMemories = (scope?: 'session' | 'persistent') => agentMemory.getAll(scope);

  const addToolOutput = useCallback(
    (params: { toolCallId: string; output?: unknown; state?: string; errorText?: string; tool?: any }) => {
      setMessages((prev) =>
        prev.map((msg) => {
          if (msg.role !== 'assistant') return msg;
          const updatedInvocations = (msg.toolInvocations || []).map((inv) =>
            inv.toolCallId === params.toolCallId
              ? { ...inv, result: params.output, state: 'result' as const }
              : inv,
          );
          return { ...msg, toolInvocations: updatedInvocations };
        }),
      );
    },
    [],
  );

  const activeComponents = uiRegistry.getActiveComponents().map((c) => c.id);
  const activeSkills = skillsManager.getActiveSkills(currentRoute, activeComponents);
  const templates = promptTemplateManager.getTemplates();
  const lastAssistantMessage = [...messages].reverse().find((m) => m.role === 'assistant');

  return {
    messages,
    setMessages,
    input,
    setInput,
    handleInputChange,
    handleSubmit,
    sendMessage,
    append: (msg: { role?: 'user'; content: string } | string) =>
      sendMessage(typeof msg === 'string' ? msg : msg.content),
    isLoading,
    status,
    error,
    addToolOutput,
    stop,
    reload: async () => {
      if (messages.length > 0) {
        const lastUser = [...messages].reverse().find((m) => m.role === 'user');
        if (lastUser) await sendMessage(lastUser.content);
      }
    },
    regenerate: async () => {
      if (messages.length > 0) {
        const lastUser = [...messages].reverse().find((m) => m.role === 'user');
        if (lastUser) await sendMessage(lastUser.content);
      }
    },
    message: lastAssistantMessage,
    selectedModel,
    setSelectedModel,
    selectedProvider,
    setSelectedProvider,
    runSlashCommand,
    chooseOption,
    steer,
    followUp,
    checkpoint,
    undo,
    redo,
    canUndo,
    canRedo,
    activeSkills,
    templates,
    newConversation,
    dumpSession,
    restoreSession,
    remember,
    recall,
    forget,
    getMemories,
    // Context Doluluk & Compaction (Pi Reference)
    contextUsage,
    autoCompactEnabled,
    setAutoCompactEnabled,
    isCompacting,
    compact,
    // Model ve Sağlayıcı Yönetimi & Built-in Komutlar (Pi Reference)
    availableModels,
    selectModel,
    executeCommand,
    // i18n Dil Desteği
    locale: currentLocale,
    dictionary: i18nManager.getDictionary(),
    setLocale: (loc: import('@my-agent/core').AgentLocale) => i18nManager.setLocale(loc),
  };
}
