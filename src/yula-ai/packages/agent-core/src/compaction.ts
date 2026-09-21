import { UIEvent, UIContextSnapshot, ContextUsage, CompactionSettings, CompactionResult } from './types';
import { modelCatalog } from './model-catalog';
import { piEventStream } from './pi-event-stream';

/**
 * Pi-Style Context Compaction & Pruning
 * Reference: earendil-works/pi/packages/coding-agent/src/core/compaction/
 */

export const DEFAULT_COMPACTION_SETTINGS: CompactionSettings = {
  enabled: true,
  reserveTokens: 16384,    // Eşik: contextWindow - reserveTokens aşıldığında otomatik tetiklenir
  keepRecentTokens: 20000, // En son mesajlardan korunacak güvenli token miktarı
};

/**
 * Pi Heuristiği: Karakter uzunluğundan token tahmini (chars / 4).
 * Muhafazakar ve hızlı tahmin yöntemidir.
 */
export function estimateTokens(content: unknown): number {
  if (!content) return 0;
  if (typeof content === 'string') {
    return Math.ceil(content.length / 4);
  }

  if (typeof content === 'object') {
    const msg = content as Record<string, any>;
    let chars = 0;

    // AgentMessage yapısı
    if (typeof msg.content === 'string') {
      chars += msg.content.length;
    } else if (Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if (block && typeof block === 'object') {
          if (block.text) chars += block.text.length;
          if (block.thinking) chars += block.thinking.length;
          if (block.arguments) chars += JSON.stringify(block.arguments).length;
        }
      }
    }

    if (Array.isArray(msg.parts)) {
      for (const part of msg.parts) {
        if (part?.text) chars += part.text.length;
      }
    }

    if (Array.isArray(msg.toolInvocations)) {
      for (const tool of msg.toolInvocations) {
        if (tool.toolName) chars += tool.toolName.length;
        if (tool.args) chars += JSON.stringify(tool.args).length;
        if (tool.result) chars += JSON.stringify(tool.result).length;
      }
    }

    if (chars > 0) return Math.ceil(chars / 4);

    return Math.ceil(JSON.stringify(content).length / 4);
  }

  return 0;
}

/**
 * Aktif oturumun Context Window doluluk oranını ve token miktarını hesaplar.
 * Pi Reference: `session.getContextUsage()`
 */
export function calculateContextUsage(
  messages: any[],
  modelId?: string,
  lastUsageTokens?: number,
): ContextUsage {
  const model = modelCatalog.getModel(modelId || 'gpt-4o-mini');
  const contextWindow = model.maxContextTokens || 128000;

  // 1. Eğer son asistan mesajında API tarafından dönen kesin usage varsa onu baz al
  let tokens = 0;
  if (typeof lastUsageTokens === 'number' && lastUsageTokens > 0) {
    tokens = lastUsageTokens;
  } else {
    // Son asistan mesajını bulup metadata'sında usage var mı incele
    let latestUsageIndex = -1;
    let latestUsageTokens = 0;

    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.role === 'assistant' && m.metadata?.usage?.totalTokens) {
        latestUsageIndex = i;
        latestUsageTokens = m.metadata.usage.totalTokens;
        break;
      }
    }

    if (latestUsageIndex >= 0) {
      // Son LLM yanıtındaki usage + o andan sonra eklenen mesajların tahmini
      let trailingTokens = 0;
      for (let i = latestUsageIndex + 1; i < messages.length; i++) {
        trailingTokens += estimateTokens(messages[i]);
      }
      tokens = latestUsageTokens + trailingTokens;
    } else {
      // API usage yoksa tüm mesajların karakter bazlı token tahmini
      for (const msg of messages) {
        tokens += estimateTokens(msg);
      }
    }
  }

  const percent = Number(((tokens / contextWindow) * 100).toFixed(1));

  return {
    tokens,
    contextWindow,
    percent,
  };
}

/**
 * Bağlam doluluğunun otomatik compaction eşiğine ulaşıp ulaşmadığını kontrol eder.
 * Pi Reference: `shouldCompact(contextTokens, contextWindow, settings)`
 */
export function shouldCompact(
  contextTokens: number,
  contextWindow: number,
  settings?: Partial<CompactionSettings>,
): boolean {
  const eff = { ...DEFAULT_COMPACTION_SETTINGS, ...settings };
  if (!eff.enabled) return false;
  return contextTokens > (contextWindow - eff.reserveTokens);
}

/**
 * Konuşma mesajlarını LLM özetleyicisi için yapılandırılmış metne dönüştürür.
 * Pi Reference: `serializeConversation`
 */
export function serializeConversationForSummary(messages: any[]): string {
  const parts: string[] = [];

  for (const msg of messages) {
    if (msg.role === 'user') {
      const text = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
      parts.push(`[User]: ${text}`);
    } else if (msg.role === 'assistant') {
      if (msg.content) {
        parts.push(`[Assistant]: ${msg.content}`);
      }
      if (Array.isArray(msg.toolInvocations) && msg.toolInvocations.length > 0) {
        const toolsStr = msg.toolInvocations
          .map((t: any) => {
            const resSnippet = JSON.stringify(t.result || '').slice(0, 300);
            return `${t.toolName}(${JSON.stringify(t.args || {})}) => ${resSnippet}`;
          })
          .join('; ');
        parts.push(`[Assistant Tool Invocations]: ${toolsStr}`);
      }
    } else if (msg.role === 'system' && !msg.id?.startsWith('summary_')) {
      // Önceki özetler haricindeki sistem mesajları
      parts.push(`[System]: ${msg.content}`);
    }
  }

  return parts.join('\n\n');
}

export const SUMMARIZATION_SYSTEM_PROMPT = `You are a context summarization assistant. Your task is to read a conversation between a user and an AI assistant, then produce a concise, structured summary capturing all key facts, decisions, preferences, and unfinished tasks.
Do NOT continue the conversation. Do NOT respond to any questions in the conversation. ONLY output the structured summary.`;

/**
 * Çevrimdışı / Local Fallback Özetleme Motoru.
 * Harici LLM API çağrısı yapılamadığında veya hata aldığında bağlamı korumak için kullanılır.
 */
export function generateLocalSummary(serializedText: string): string {
  const lines = serializedText.split('\n');
  const userPrompts: string[] = [];
  const toolsExecuted: string[] = [];

  for (const line of lines) {
    if (line.startsWith('[User]:')) {
      const prompt = line.replace('[User]:', '').trim();
      if (prompt && !userPrompts.includes(prompt)) {
        userPrompts.push(prompt.slice(0, 120));
      }
    } else if (line.startsWith('[Assistant Tool Invocations]:')) {
      const toolStr = line.replace('[Assistant Tool Invocations]:', '').trim();
      if (toolStr && !toolsExecuted.includes(toolStr)) {
        toolsExecuted.push(toolStr.slice(0, 150));
      }
    }
  }

  let summary = `## Oturum Özeti (Local Compaction)\n`;
  if (userPrompts.length > 0) {
    summary += `**Önceki Kullanıcı Talepleri:**\n${userPrompts.map((p) => `- ${p}`).join('\n')}\n\n`;
  }
  if (toolsExecuted.length > 0) {
    summary += `**Çalıştırılan Araçlar & Eylemler:**\n${toolsExecuted.map((t) => `- ${t}`).join('\n')}\n\n`;
  }
  summary += `*(Daha önceki konuşma geçmişi bağlam sınırını aşmamak için başarıyla özetlendi ve arşivlendi).*`;

  return summary;
}

export interface CompactConversationOptions {
  messages: any[];
  modelId?: string;
  settings?: Partial<CompactionSettings>;
  summarizeFn?: (serialized: string) => Promise<string>;
  customInstructions?: string;
  reason?: 'threshold' | 'overflow' | 'manual';
}

/**
 * Mesaj geçmişini analiz edip eski turları özetleyerek bağlamı daraltır.
 * Pi Reference: `compact()`
 */
export async function compactConversation(
  options: CompactConversationOptions,
): Promise<{ compactedMessages: any[]; result: CompactionResult }> {
  const { messages, modelId, settings, summarizeFn, customInstructions, reason = 'threshold' } = options;
  const effSettings = { ...DEFAULT_COMPACTION_SETTINGS, ...settings };

  const tokensBefore = calculateContextUsage(messages, modelId).tokens;

  piEventStream.emit({
    type: 'compaction_start',
    reason,
    tokensBefore,
    timestamp: Date.now(),
  });

  // Sondan başa doğru keepRecentTokens kadar mesajı tespit et
  let accumulatedRecentTokens = 0;
  let cutIndex = messages.length;

  for (let i = messages.length - 1; i >= 0; i--) {
    const msgTok = estimateTokens(messages[i]);
    if (accumulatedRecentTokens + msgTok > effSettings.keepRecentTokens && i < messages.length - 1) {
      cutIndex = i + 1;
      break;
    }
    accumulatedRecentTokens += msgTok;
  }

  // Eğer kesilecek mesaj yoksa veya konuşma zaten tek tur ise
  if (cutIndex <= 0 || cutIndex >= messages.length) {
    const result: CompactionResult = {
      summary: '',
      tokensBefore,
      estimatedTokensAfter: tokensBefore,
      compactedMessagesCount: 0,
      keptMessagesCount: messages.length,
    };
    return { compactedMessages: messages, result };
  }

  const toCompact = messages.slice(0, cutIndex);
  const kept = messages.slice(cutIndex);

  const serialized = serializeConversationForSummary(toCompact);
  let summaryText = '';

  if (summarizeFn) {
    try {
      const fullPrompt = customInstructions
        ? `${serialized}\n\nEk Talimat: ${customInstructions}`
        : serialized;
      summaryText = await summarizeFn(fullPrompt);
    } catch {
      summaryText = generateLocalSummary(serialized);
    }
  } else {
    summaryText = generateLocalSummary(serialized);
  }

  const summaryMessage = {
    id: `summary_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    role: 'system' as const,
    content: `[Önceki Konuşma Özeti (Compaction)]:\n${summaryText}`,
    parts: [{ type: 'text' as const, text: `[Önceki Konuşma Özeti (Compaction)]:\n${summaryText}` }],
    createdAt: new Date(),
  };

  const compactedMessages = [summaryMessage, ...kept];
  const tokensAfter = calculateContextUsage(compactedMessages, modelId).tokens;

  const result: CompactionResult = {
    summary: summaryText,
    tokensBefore,
    estimatedTokensAfter: tokensAfter,
    compactedMessagesCount: toCompact.length,
    keptMessagesCount: kept.length,
  };

  piEventStream.emit({
    type: 'compaction_end',
    reason,
    tokensBefore,
    tokensAfter,
    summary: summaryText,
    timestamp: Date.now(),
  });

  return {
    compactedMessages,
    result,
  };
}

// ============================================================================
// UI Event Compaction (Geriye Dönük Uyumluluk)
// ============================================================================

export function compactUIEvents(events: UIEvent[], maxCount: number = 6): UIEvent[] {
  if (events.length <= 1) return events;

  // 1. Topic içi tekil son durum: Aynı topic + type için yalnızca EN GÜNCEL olanı koru
  const seen = new Set<string>();
  const distinctReversed: UIEvent[] = [];
  for (let i = events.length - 1; i >= 0; i--) {
    const current = events[i];
    const key = `${current.topic ?? 'system'}:${current.type}`;
    if (!seen.has(key)) {
      seen.add(key);
      distinctReversed.push(current);
    }
  }
  const distinct = distinctReversed.reverse();

  if (distinct.length <= maxCount) return distinct;

  // 2. Maksimum limit aşılıyorsa topic bazında dengeli seçerek sınırla
  const byTopic = new Map<string, UIEvent[]>();
  for (const ev of distinct) {
    const t = ev.topic ?? 'system';
    if (!byTopic.has(t)) byTopic.set(t, []);
    byTopic.get(t)!.push(ev);
  }

  const perTopic = Math.max(1, Math.floor(maxCount / Math.max(1, byTopic.size)));
  const balanced: UIEvent[] = [];
  for (const [, topicEvents] of byTopic) {
    balanced.push(...topicEvents.slice(-perTopic));
  }

  return balanced.sort((a, b) => a.timestamp - b.timestamp).slice(-maxCount);
}

export function compactContextSnapshot(snapshot: UIContextSnapshot): UIContextSnapshot {
  return {
    ...snapshot,
    recent_events: compactUIEvents(snapshot.recent_events),
  };
}
