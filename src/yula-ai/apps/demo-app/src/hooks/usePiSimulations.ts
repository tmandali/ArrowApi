import React from 'react';
import {
  piEventStream,
  executeComponentAction,
  steeringManager,
  truncateContent,
  mutationLine,
  adaptivePublisher,
  retryWithBackoff,
  agentMemory,
  pluginRegistry,
  hookPipeline,
} from '@my-agent/core';
import { loyaltyDiscountPlugin } from '../plugins/loyaltyDiscountPlugin';

interface UsePiSimulationsParams {
  setStoreId: (s: string) => void;
  setDateRange: (d: string) => void;
  storeIdRef: React.MutableRefObject<string>;
  dateRangeRef: React.MutableRefObject<string>;
  handleGenerateReport: () => any;
  addLog: (msg: string) => void;
}

export function usePiSimulations({
  setStoreId,
  setDateRange,
  storeIdRef,
  dateRangeRef,
  handleGenerateReport,
  addLog,
}: UsePiSimulationsParams) {
  const runPreflightTestValid = async () => {
    piEventStream.emit({
      type: 'tool_execution_start',
      toolCallId: 'sim_1',
      toolName: 'dispatch_component_action',
      args: { component_id: 'filter_form', action: 'SET_FIELDS', payload: { storeId: 'Kadıköy', dateRange: '2026-09' } },
    });
    const res = await executeComponentAction({
      component_id: 'filter_form',
      action: 'SET_FIELDS',
      payload: { storeId: 'Kadıköy', dateRange: '2026-09' },
    });
    piEventStream.emit({
      type: 'tool_execution_end',
      toolCallId: 'sim_1',
      toolName: 'dispatch_component_action',
      result: res,
      isError: !res.success,
    });
    addLog(`[Agent Tool]: ${JSON.stringify(res)}`);
  };

  const runPreflightTestSubmit = async () => {
    piEventStream.emit({
      type: 'tool_execution_start',
      toolCallId: 'sim_2',
      toolName: 'dispatch_component_action',
      args: { component_id: 'filter_form', action: 'SUBMIT' },
    });
    const res = await executeComponentAction({
      component_id: 'filter_form',
      action: 'SUBMIT',
      payload: {},
    });
    piEventStream.emit({
      type: 'tool_execution_end',
      toolCallId: 'sim_2',
      toolName: 'dispatch_component_action',
      result: res,
      isError: !res.success,
    });
    addLog(`[Agent Tool SUBMIT]: ${JSON.stringify(res)}`);
  };

  const triggerSteerSimulation = () => {
    steeringManager.steer("Durdur! Kadıköy yerine Beşiktaş mağazasını seç.");
    addLog("⚡ [Steering Araya Girme]: 'Durdur! Kadıköy yerine Beşiktaş mağazasını seç.' kuyruğa enjekte edildi.");
  };

  const triggerFollowUpSimulation = () => {
    steeringManager.followUp("Raporu hazırladıktan sonra sonuçları azalan sırada sırala.");
    addLog("📥 [Follow-up Takip]: 'Rapor bitince azalan sırada sırala' kuyruğa eklendi.");
  };

  const runTruncateTest = () => {
    const hugeMock = Array.from({ length: 1000 }, (_, i) => `Satır ${i + 1}: SKU-ITEM-${i} -> Detaylı telemetri log kaydı`).join('\n');
    const truncated = truncateContent(hugeMock, { maxLines: 12, maxBytes: 600 });
    const finalLines = truncated.content.split('\n').length;
    const finalBytes = new TextEncoder().encode(truncated.content).length;
    addLog(`✂️ [Truncation]: 1000 satır veri kesildi (${truncated.originalLines} satır / ${truncated.originalBytes} byte -> ${finalLines} satır / ${finalBytes} byte).`);
    alert(`Dual-bound Kesme Sonucu (Truncated):\n${truncated.content}`);
  };

  const runMutationLineTest = async () => {
    addLog(`⛓️ [MutationLine]: 3 ardışık atomik mutasyon kuyruğa alındı...`);
    mutationLine.enqueue(async () => {
      await new Promise((r) => setTimeout(r, 80));
      addLog(`⛓️ [MutationLine #1]: Mağaza 'Beşiktaş' olarak güncellendi.`);
      setStoreId('Beşiktaş');
      storeIdRef.current = 'Beşiktaş';
    });
    mutationLine.enqueue(async () => {
      await new Promise((r) => setTimeout(r, 80));
      addLog(`⛓️ [MutationLine #2]: Tarih '2026-10' olarak güncellendi.`);
      setDateRange('2026-10');
      dateRangeRef.current = '2026-10';
    });
    mutationLine.enqueue(async () => {
      await new Promise((r) => setTimeout(r, 80));
      addLog(`⛓️ [MutationLine #3]: Rapor otomatik tetiklendi.`);
      handleGenerateReport();
    });
  };

  const runAdaptivePublisherTest = () => {
    addLog(`🌊 [AdaptivePublisher]: 15 yüksek hızlı mikro-güncelleme gönderiliyor (16ms batch penceresi)...`);
    for (let i = 1; i <= 15; i++) {
      adaptivePublisher.publish({
        type: 'message_update',
        message: { role: 'assistant', content: `Canlı veri akış paketi #${i}` },
      });
    }
    addLog(`🌊 [AdaptivePublisher]: 15 mikro-güncelleme 60fps sınırına uyumlu tek frame içinde birleştirildi.`);
  };

  const runRetryTest = async () => {
    let attempts = 0;
    addLog(`🔁 [Retry]: Ağ isteği simülasyonu başlatılıyor (2 yapay hata, 3. denemede başarı)...`);
    try {
      const result = await retryWithBackoff(
        async () => {
          attempts++;
          if (attempts < 3) {
            throw new Error(`Ağ zaman aşımı (Deneme #${attempts})`);
          }
          return 'Veriler 3. denemede başarıyla çekildi!';
        },
        {
          maxRetries: 3,
          initialDelayMs: 150,
          backoffMultiplier: 2,
        }
      );
      addLog(`✅ [Retry Başarılı]: ${result}`);
    } catch (err: any) {
      addLog(`❌ [Retry Başarısız]: ${err.message}`);
    }
  };

  const runMemoryTest = () => {
    agentMemory.remember('preferred_store', 'Kadıköy', 'persistent', 'Kullanıcının varsayılan mağaza tercihi');
    agentMemory.remember('last_quarter', '2026-Q3', 'session', 'İncelenen son finansal çeyrek');
    addLog(`🧠 [Bellek]: 'preferred_store=Kadıköy' ve 'last_quarter=2026-Q3' kaydedildi.`);
  };

  const runPluginTest = async () => {
    const { pluginRegistry } = await import('@my-agent/core');
    await pluginRegistry.register({
      id: 'demo_analytics_plugin',
      name: 'Satış Tahminleme Eklentisi (Plugin)',
      version: '1.0.0',
      description: 'Gelişmiş AI tahmin ve anomaly tespit araçları paketi',
      skills: [
        {
          name: 'predictive-analytics',
          description: 'Gelecek ay stok talebini tahmin etme kılavuzu',
          instructions: 'Kullanıcı tahmin istediğinde geçmiş 3 aylık satış ortalamasını baz al.',
        },
      ],
    });
    addLog(`🔌 [Plugin Sistemi]: 'demo_analytics_plugin' ve 'predictive-analytics' yeteneği yüklendi!`);
    alert(`✅ Eklenti başarıyla sisteme bağlandı!\nYeni Beceri: predictive-analytics`);
  };

  const runLanesTest = async () => {
    const { multiLaneScheduler } = await import('@my-agent/core');
    addLog(`🛤️ [Multi-Lane]: 'interactive' ve 'background' şeritlerine aynı anda görevler gönderildi.`);
    
    // Arka plan görevi
    multiLaneScheduler.enqueue('background', 'Arka Plan Stok Denetimi', async () => {
      await new Promise((r) => setTimeout(r, 200));
      addLog(`🛤️ [Multi-Lane / Background]: Arka plan stok taraması tamamlandı (0 açık).`);
    });

    // İnteraktif sohbet görevi
    multiLaneScheduler.enqueue('interactive', 'Kullanıcı Form Doldurma', async () => {
      setStoreId('Kadıköy');
      addLog(`🛤️ [Multi-Lane / Interactive]: Kullanıcı formuna öncelikli yanıt verildi.`);
    });
  };

  const runDeferredTest = async () => {
    const { deferredManager } = await import('@my-agent/core');
    addLog(`⏱️ [Deferred]: Uzun süren asenkron PDF ihracı askıya alınıyor...`);
    const { handle, promise } = deferredManager.createDeferred('async_pdf_export', { format: 'PDF-A' });

    // 1 saniye sonra simüle edilmiş arka plan tamamlama
    setTimeout(() => {
      deferredManager.resume(handle.handleId, { downloadUrl: '/downloads/sales_2026.pdf', sizeMb: 2.4 });
    }, 1000);

    const res = await promise;
    addLog(`✅ [Deferred Sürdürüldü / Resumed]: ${JSON.stringify(res)}`);
    alert(`✅ Asenkron Görev Başarıyla Uyandırıldı (Resumed):\n${JSON.stringify(res, null, 2)}`);
  };

  const runReconcileTest = async () => {
    const { reconciliationEngine } = await import('@my-agent/core');
    // Kasti askıda kalan işlem üret
    reconciliationEngine.simulateCrashOrphan('sim_orphan_99', 'uncommitted_payment_flow');
    addLog(`⚠️ [Reconciliation]: Kasti yarım kalmış işlem enjekte edildi (sim_orphan_99).`);
    
    // Kurtarma motorunu çalıştır
    const report = reconciliationEngine.reconcile();
    addLog(`🔄 [Reconciliation Sonucu]: ${report.message}`);
    alert(`🔄 Kurtarma Raporu:\n${report.message}\nDetaylar: ${report.details.join(', ')}`);
  };

  const runRpcTest = async () => {    const { defaultRpcTransport } = await import('@my-agent/core');
    addLog(`🌐 [RPC İstemcisi]: JSON-RPC 2.0 üzerinden 'execute_action' gönderiliyor...`);
    const response = await defaultRpcTransport.send('execute_action', {
      component_id: 'filter_form',
      action: 'SET_FIELDS',
      payload: { storeId: 'Kadıköy', dateRange: '2026-09' },
    });
    addLog(`🌐 [RPC Yanıtı]: ${JSON.stringify(response)}`);
    alert(`🌐 JSON-RPC 2.0 Yanıtı:\n${JSON.stringify(response, null, 2)}`);
  };

  const runVipCouponScenario = async () => {
    // 1. Custom plugin'i tak (zaten takılıysa register no-op)
    await pluginRegistry.register(loyaltyDiscountPlugin as any);
    addLog(`🎟️ [VIP Senaryo 1/3]: '${loyaltyDiscountPlugin.name}' takıldı — skill + tool + guard aktif.`);

    // 2. Geçerli kupon: %20 → hook'tan geçer, tool çalışır
    const tool = (loyaltyDiscountPlugin as any).tools?.apply_vip_discount;
    const hookOk = await hookPipeline.runBeforeHooks({
      toolName: 'apply_vip_discount',
      toolCallId: `sim_vip_20_${Date.now()}`,
      args: { customerId: 'Kadıköy-VIP-101', discountPercentage: 20 },
      activeComponents: [],
    });
    if (hookOk?.block) {
      addLog(`❌ [VIP Senaryo 2/3]: Beklenmedik engel: ${hookOk.block.reason}`);
    } else {
      const res = await tool.execute({ customerId: 'Kadıköy-VIP-101', discountPercentage: 20 });
      addLog(`🎟️ [VIP Senaryo 2/3]: ${res.message}`);
    }

    // 3. Kural ihlali: %45 → guard hook engeller
    const hookBlocked = await hookPipeline.runBeforeHooks({
      toolName: 'apply_vip_discount',
      toolCallId: `sim_vip_45_${Date.now()}`,
      args: { customerId: 'Kadıköy-VIP-999', discountPercentage: 45 },
      activeComponents: [],
    });
    if (hookBlocked?.block) {
      addLog(`🛡️ [VIP Senaryo 3/3]: Guard engelledi — ${hookBlocked.block.reason}`);
    } else {
      addLog(`❌ [VIP Senaryo 3/3]: %45 engellenemedi, guard çalışmıyor!`);
    }
  };

  return {
    runPreflightTestValid,
    runPreflightTestSubmit,
    triggerSteerSimulation,
    triggerFollowUpSimulation,
    runTruncateTest,
    runMutationLineTest,
    runAdaptivePublisherTest,
    runRetryTest,
    runMemoryTest,
    runPluginTest,
    runLanesTest,
    runDeferredTest,
    runReconcileTest,
    runRpcTest,
    runVipCouponScenario,
  };
}
