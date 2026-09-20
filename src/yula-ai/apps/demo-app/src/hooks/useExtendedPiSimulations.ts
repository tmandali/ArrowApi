import {
  Agent,
  AgentSession,
  createStandardAgentTools,
  compactConversation,
  piEventStream,
} from '@my-agent/core';

interface UseExtendedPiSimulationsParams {
  addLog: (msg: string) => void;
  setStoreId: (s: string) => void;
  setDateRange: (d: string) => void;
  handleGenerateReport: () => any;
}

export function useExtendedPiSimulations({
  addLog,
  setStoreId,
  setDateRange,
  handleGenerateReport,
}: UseExtendedPiSimulationsParams) {
  // 1. Otonom ReAct Döngüsü Simülasyonu (Çok Turlu Otonom Zincir)
  const runAutonomousLoopScenario = async () => {
    addLog(`🤖 [Otonom ReAct Döngüsü]: Çok turlu hedef icrası başlatılıyor...`);
    let turnCount = 0;

    const mockStreamFn = async () => {
      turnCount++;
      if (turnCount === 1) {
        addLog(`🤖 [Tur 1]: Model düşünüyor -> Form kriterlerini uyguluyor...`);
        return {
          message: { role: 'assistant', content: 'Kadıköy mağazası için Eylül 2026 kriterlerini uyguluyorum.' },
          toolCalls: [
            {
              id: 'tc_auto_1',
              name: 'dispatch_component_action',
              arguments: {
                component_id: 'filter_form',
                action: 'SET_FIELDS',
                payload: { storeId: 'Kadıköy', dateRange: '2026-09' },
              },
            },
          ],
        };
      } else if (turnCount === 2) {
        addLog(`🤖 [Tur 2]: Kriterler uygulandı -> Rapor otomatik çalıştırılıyor...`);
        return {
          message: { role: 'assistant', content: 'Raporu çalıştırıyorum ve verileri çekiyorum.' },
          toolCalls: [
            {
              id: 'tc_auto_2',
              name: 'dispatch_component_action',
              arguments: { component_id: 'filter_form', action: 'SUBMIT', payload: {} },
            },
          ],
        };
      } else {
        addLog(`🎯 [Tur 3]: Veriler geldi -> Model nihai analizi tamamladı!`);
        return {
          message: {
            role: 'assistant',
            content: '✅ Kadıköy mağazası 2026-09 satış analizi başarıyla tamamlandı: Toplam ciro 1.450.000 TL, en çok satan kategori Elektronik.',
          },
          toolCalls: [],
          stopReason: 'end_turn' as const,
        };
      }
    };

    const simAgent = new Agent({
      tools: createStandardAgentTools(),
      streamFn: mockStreamFn,
      maxIterations: 10,
    });

    const session = new AgentSession({
      agent: simAgent,
      autoCompaction: false,
    });

    session.subscribe((e) => {
      piEventStream.emit(e as any);
      if (e.type === 'tool_execution_end') {
        addLog(`🔧 [Araç Sonucu]: ${e.toolName} başarıyla icra edildi.`);
      }
    });

    await session.prompt('Kadıköy 2026-09 raporunu oluştur ve analiz et');
    addLog(`🏁 [Otonom Döngü Bitti]: Hedefe 3 turda kesintisiz ulaşıldı.`);
  };

  // 2. Inline HITL & ask_user_choice Simülasyonu
  const runUserChoiceScenario = async () => {
    addLog(`🃏 [Inline HITL]: Model kullanıcıya soru sorma aracını tetikliyor...`);
    const simAgent = new Agent({
      tools: createStandardAgentTools(),
      streamFn: async () => ({
        message: { role: 'assistant', content: 'Rapor dönemi için birden fazla seçenek mevcut.' },
        toolCalls: [
          {
            id: 'tc_choice_1',
            name: 'ask_user_choice',
            arguments: {
              question: 'Hangi tarih aralığını incelemek istersiniz?',
              options: ['Son 7 Gün', 'Bu Ay (2026-09)', 'Geçen Çeyrek'],
            },
          },
        ],
      }),
      shouldStopAfterTurn: (ctx) => {
        return ctx.toolResults?.some((tr: any) => tr?.terminate === true);
      },
    });

    const session = new AgentSession({
      agent: simAgent,
      autoCompaction: false,
    });

    session.subscribe((e) => piEventStream.emit(e as any));
    await session.prompt('Satışları incele');
    addLog(`⏸️ [Döngü Askıya Alındı]: ask_user_choice tetiklendi, kullanıcı seçimi bekleniyor.`);
    alert(`🃏 ask_user_choice Tetiklendi!\nDöngü temiz biçimde askıya alındı (Inline HITL kartı render edilecek).`);
  };

  // 3. Kısırdöngü (Stagnation) Sezici Simülasyonu
  const runStagnationScenario = async () => {
    addLog(`🛑 [Stagnation Sezici]: Modelin aynı parametrelerle takılma durumu test ediliyor...`);
    let count = 0;
    const fingerprints: string[] = [];

    while (count < 4) {
      count++;
      const fp = 'dispatch_component_action:{"component_id":"filter_form","action":"SET_FIELDS"}';
      fingerprints.push(fp);
      addLog(`⚠️ [Döngü Turu #${count}]: Aynı araç çağrıldı: filter_form -> SET_FIELDS`);
      if (fingerprints.length >= 3 && fingerprints.slice(-3).every((f) => f === fp)) {
        addLog(`🚨 [Stagnation Tespiti]: Son 3 tur birebir aynı! Kısırdöngü kırıldı ve döngü durduruldu.`);
        alert(`🚨 Stagnation Detector Devreye Girdi!\nModel kısırdöngüye girdiğinde döngü otomatik kırıldı.`);
        break;
      }
    }
  };

  // 4. Context Compaction Simülasyonu
  const runCompactionScenario = async () => {
    addLog(`🧹 [Context Compaction]: 15 mesajlık uzun konuşma özetleniyor...`);
    const mockMessages = Array.from({ length: 15 }, (_, i) => ({
      id: `msg_${i}`,
      role: i % 2 === 0 ? ('user' as const) : ('assistant' as const),
      content: `Bu ${i + 1}. mesajdır. Satış verileri ve mağaza performans detayları içerir.`,
    }));

    const { compactedMessages, result } = await compactConversation({
      messages: mockMessages,
      settings: { enabled: true, keepRecentTokens: 50 },
      reason: 'manual',
    });

    addLog(`🧹 [Compaction Başarılı]: ${result.tokensBefore} token -> ${result.estimatedTokensAfter} token (${result.compactedMessagesCount} mesaj arşivlendi).`);
    alert(`🧹 Konuşma Başarıyla Özetlendi!\nÖzet: ${result.summary}\nKalan Mesaj Sayısı: ${compactedMessages.length}`);
  };

  // 5. Session Fork & Clone Simülasyonu (Pi Ağaç Yönetimi)
  const runForkCloneScenario = async () => {
    addLog(`🌳 [Session Fork & Clone]: Mevcut oturumdan yeni bir dal türetiliyor...`);
    const simAgent = new Agent({
      tools: createStandardAgentTools(),
      streamFn: async () => ({
        message: { role: 'assistant', content: 'Kök oturum yanıtı.' },
        toolCalls: [],
      }),
    });

    const rootSession = new AgentSession({
      agent: simAgent,
      sessionId: 'session_root_001',
    });

    await rootSession.prompt('Kök oturum başlat');
    addLog(`🌳 [Kök Oturum]: ID=${rootSession.sessionId}, Mesaj Sayısı=${rootSession.getMessages().length}`);

    // Fork işlemi
    const forkedSession = rootSession.fork();
    addLog(`🌿 [Dallandırılmış Oturum]: ID=${forkedSession.sessionId}, Kök oturumdan miras alındı.`);

    // Clone işlemi
    const clonedSession = rootSession.clone();
    addLog(`📋 [Klonlanmış Oturum]: ID=${clonedSession.sessionId}, Tam kopya oluşturuldu.`);

    alert(`🌳 Session Fork & Clone Başarılı!\nKök: ${rootSession.sessionId}\nDal (Fork): ${forkedSession.sessionId}\nKlon: ${clonedSession.sessionId}`);
  };

  // 6. Standalone HTML Denetim Raporu Export Simülasyonu
  const runExportHtmlScenario = async () => {
    addLog(`📄 [HTML Export]: Standalone interaktif denetim raporu üretiliyor...`);
    const simAgent = new Agent({
      tools: createStandardAgentTools(),
      streamFn: async () => ({
        message: { role: 'assistant', content: 'Satış raporu analizi ve denetim logları.' },
        toolCalls: [],
      }),
    });

    const session = new AgentSession({
      agent: simAgent,
      sessionId: 'yula_audit_report_demo',
    });

    await session.prompt('Kadıköy mağazası denetimini hazırla');

    const html = session.exportHtml({
      activeComponent: 'filter_form',
      lastAction: 'SUBMIT',
      timestamp: new Date().toISOString(),
    });

    addLog(`📄 [HTML Export]: ${html.length} karakter uzunluğunda rapor oluşturuldu.`);

    // Yeni sekmede aç
    try {
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const win = window.open(url, '_blank');
      if (!win) {
        alert(`📄 HTML Denetim Raporu Üretildi (${html.length} byte).\nAçılır pencere engellendiği için doğrudan gösterilemedi.`);
      } else {
        addLog(`🌐 [HTML Export]: Rapor yeni tarayıcı sekmesinde açıldı.`);
      }
    } catch {
      alert(`📄 HTML Denetim Raporu Başarıyla Oluşturuldu (${html.length} karakter).`);
    }
  };

  // 7. Progressive Tool Streaming Updates Simülasyonu
  const runStreamingUpdateScenario = async () => {
    addLog(`📡 [Tool Streaming]: Aşamalı araç yürütme güncellemeleri yayınlanıyor...`);
    const toolCallId = `tc_stream_${Date.now()}`;

    piEventStream.emit({
      type: 'tool_execution_start',
      toolCallId,
      toolName: 'duckdb_query',
      args: { sql: 'SELECT * FROM sales_2026' },
    });
    addLog(`📡 [Tool Start]: duckdb_query başlatıldı.`);

    await new Promise((r) => setTimeout(r, 120));
    piEventStream.emit({
      type: 'tool_execution_update',
      toolCallId,
      toolName: 'duckdb_query',
      args: { sql: 'SELECT * FROM sales_2026' },
      partialResult: { progress: '25%', rowsRead: 2500, phase: 'Parquet Scan' },
    });
    addLog(`📡 [Tool Update 25%]: 2500 satır tarandı (Parquet Scan).`);

    await new Promise((r) => setTimeout(r, 120));
    piEventStream.emit({
      type: 'tool_execution_update',
      toolCallId,
      toolName: 'duckdb_query',
      args: { sql: 'SELECT * FROM sales_2026' },
      partialResult: { progress: '75%', rowsRead: 7500, phase: 'Aggregate Calculation' },
    });
    addLog(`📡 [Tool Update 75%]: 7500 satır toplandı (Aggregate Calculation).`);

    await new Promise((r) => setTimeout(r, 120));
    piEventStream.emit({
      type: 'tool_execution_end',
      toolCallId,
      toolName: 'duckdb_query',
      result: { totalRows: 10000, executionTimeMs: 360, status: 'completed' },
      isError: false,
    });
    addLog(`✅ [Tool End]: duckdb_query 10.000 satır ile 360ms içinde tamamlandı.`);
    alert(`📡 Progressive Tool Streaming Başarılı!\nAraç ilerlemesi adım adım yayınlandı ve arayüze aktarıldı.`);
  };

  // 8. Oturum Seviyesinde Auto-Retry Simülasyonu
  const runSessionRetryScenario = async () => {
    addLog(`🔁 [Session Auto-Retry]: Transiyent API 429 Rate Limit hatası simülasyonu...`);
    let callCount = 0;

    const flakyStreamFn = async () => {
      callCount++;
      if (callCount < 2) {
        addLog(`⚠️ [Model Çağrısı #${callCount}]: 429 Too Many Requests (Rate Limit)!`);
        throw new Error('429 Too Many Requests - Rate limit exceeded, please retry.');
      }
      addLog(`✅ [Model Çağrısı #${callCount}]: Başarılı yanıt alındı!`);
      return {
        message: { role: 'assistant', content: 'Kurtarma başarılı: Oturum otomatik yeniden deneme ile tamamlandı.' },
        toolCalls: [],
      };
    };

    const simAgent = new Agent({
      tools: [],
      streamFn: flakyStreamFn,
    });

    const session = new AgentSession({
      agent: simAgent,
      autoRetry: true,
      maxRetries: 3,
    });

    session.subscribe((e) => {
      piEventStream.emit(e as any);
      if (e.type === 'auto_retry_start') {
        addLog(`🔁 [Auto-Retry Başladı]: Deneme ${e.attempt}/${e.maxAttempts} (Bekleme: ${e.delayMs}ms)`);
      } else if (e.type === 'auto_retry_end') {
        addLog(`🎉 [Auto-Retry Bitti]: Başarı durumu=${e.success}`);
      }
    });

    const res = await session.prompt('Verileri getir');
    addLog(`🏁 [Sonuç]: ${res[res.length - 1]?.content}`);
    alert(`🔁 Session Auto-Retry Başarılı!\n429 hatası otomatik algılandı ve 2. denemede başarı sağlandı.`);
  };

  return {
    runAutonomousLoopScenario,
    runUserChoiceScenario,
    runStagnationScenario,
    runCompactionScenario,
    runForkCloneScenario,
    runExportHtmlScenario,
    runStreamingUpdateScenario,
    runSessionRetryScenario,
  };
}
