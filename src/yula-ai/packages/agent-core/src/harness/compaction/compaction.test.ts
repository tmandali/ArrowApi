import { describe, it, expect } from 'vitest';
import {
  estimateTokens,
  calculateContextUsage,
  shouldCompact,
  serializeConversationForSummary,
  generateLocalSummary,
  compactConversation,
  DEFAULT_COMPACTION_SETTINGS,
} from './compaction';

describe('Context Compaction & Token Accounting (Pi Reference)', () => {
  it('estimateTokens karakter uzunluğunu chars/4 kuralıyla hesaplamalıdır', () => {
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('1234')).toBe(1);
    expect(estimateTokens('12345678')).toBe(2);
    expect(
      estimateTokens({
        role: 'user',
        content: 'Merhaba dünya, bu bir test mesajıdır.',
      }),
    ).toBeGreaterThan(5);
  });

  it('calculateContextUsage modelin context penceresine göre doluluk ve yüzde hesaplamalıdır', () => {
    const mockMessages = [
      { role: 'user', content: 'Filtreleri güncelle Kadıköy yap' },
      { role: 'assistant', content: 'Kadıköy mağazası seçildi.' },
    ];

    const usage = calculateContextUsage(mockMessages, 'gpt-4o-mini');
    expect(usage.contextWindow).toBe(128000);
    expect(usage.tokens).toBeGreaterThan(0);
    expect(usage.percent).toBeGreaterThanOrEqual(0);
    expect(usage.percent).toBeLessThan(10);
  });

  it('calculateContextUsage asistan mesajındaki API usage bilgisini önceliklendirmelidir', () => {
    const mockMessages = [
      { role: 'user', content: 'Raporu çalıştır' },
      {
        role: 'assistant',
        content: 'Rapor tamamlandı.',
        metadata: {
          usage: {
            promptTokens: 1200,
            completionTokens: 300,
            totalTokens: 1500,
          },
        },
      },
    ];

    const usage = calculateContextUsage(mockMessages, 'gpt-4o-mini');
    expect(usage.tokens).toBe(1500);
    expect(usage.percent).toBe(Number(((1500 / 128000) * 100).toFixed(1)));
  });

  it('shouldCompact eşik aşımında true, normal durumda false dönmelidir', () => {
    const contextWindow = 100000;
    const settings = { enabled: true, reserveTokens: 15000, keepRecentTokens: 20000 };

    // 100000 - 15000 = 85000 eşiği
    expect(shouldCompact(50000, contextWindow, settings)).toBe(false);
    expect(shouldCompact(84999, contextWindow, settings)).toBe(false);
    expect(shouldCompact(85001, contextWindow, settings)).toBe(true);
    expect(shouldCompact(95000, contextWindow, settings)).toBe(true);

    // Ayar devre dışıysa asla tetiklenmemeli
    expect(shouldCompact(95000, contextWindow, { enabled: false })).toBe(false);
  });

  it('serializeConversationForSummary mesajları özetleyici formatına dönüştürmelidir', () => {
    const messages = [
      { role: 'user', content: 'Kadıköy raporunu aç' },
      {
        role: 'assistant',
        content: 'Filtre formu açılıyor...',
        toolInvocations: [
          {
            toolName: 'dispatch_component_action',
            args: { component_id: 'filter_form', action: 'SET_FIELDS' },
            result: { success: true },
          },
        ],
      },
    ];

    const serialized = serializeConversationForSummary(messages);
    expect(serialized).toContain('[User]: Kadıköy raporunu aç');
    expect(serialized).toContain('[Assistant]: Filtre formu açılıyor...');
    expect(serialized).toContain('dispatch_component_action');
  });

  it('compactConversation eski mesajları özetleyip yeni mesaj listesini oluşturmalıdır', async () => {
    // keepRecentTokens'ı aşacak uzunlukta mesajlar simüle edelim
    const messages: any[] = [];
    for (let i = 0; i < 20; i++) {
      messages.push({
        id: `msg_u_${i}`,
        role: 'user',
        content: `Kullanıcı adımı ${i}: Mağaza ve tarih parametrelerini güncelle. Bu uzun bir test içeriğidir.`,
      });
      messages.push({
        id: `msg_a_${i}`,
        role: 'assistant',
        content: `Asistan yanıtı ${i}: İşlem gerçekleştirildi ve ekrana yansıtıldı.`,
      });
    }

    const { compactedMessages, result } = await compactConversation({
      messages,
      modelId: 'gpt-4o-mini',
      settings: {
        enabled: true,
        keepRecentTokens: 50, // Test için küçük tutuyoruz ki eski mesajlar kesilsin
        reserveTokens: 100,
      },
    });

    expect(result.compactedMessagesCount).toBeGreaterThan(0);
    expect(result.keptMessagesCount).toBeGreaterThan(0);
    expect(compactedMessages[0].role).toBe('system');
    expect(compactedMessages[0].content).toContain('[Önceki Konuşma Özeti (Compaction)]:');
    expect(result.summary).toBeTruthy();
    expect(result.summary).toContain('## Goal');
    expect(result.summary).toContain('## Progress');
    expect(result.summary).toContain('## Key Decisions');
  });

  it('exports structured summarization prompt templates conforming to 5-section schema', async () => {
    const { SUMMARIZATION_PROMPT, UPDATE_SUMMARIZATION_PROMPT, SUMMARIZATION_SYSTEM_PROMPT } =
      await import('./compaction');

    expect(SUMMARIZATION_SYSTEM_PROMPT).toContain('ONLY output the structured summary');
    expect(SUMMARIZATION_PROMPT).toContain('## Goal');
    expect(SUMMARIZATION_PROMPT).toContain('## Constraints & Preferences');
    expect(SUMMARIZATION_PROMPT).toContain('## Progress');
    expect(SUMMARIZATION_PROMPT).toContain('### Done');
    expect(SUMMARIZATION_PROMPT).toContain('### In Progress');
    expect(SUMMARIZATION_PROMPT).toContain('### Blocked');
    expect(SUMMARIZATION_PROMPT).toContain('## Key Decisions');
    expect(SUMMARIZATION_PROMPT).toContain('## Critical Context');

    expect(UPDATE_SUMMARIZATION_PROMPT).toContain('<previous-summary>');
    expect(UPDATE_SUMMARIZATION_PROMPT).toContain('## Goal');
    expect(UPDATE_SUMMARIZATION_PROMPT).toContain('## Progress');
  });
});
