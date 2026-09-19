import React, { useState, useEffect, useRef } from 'react';
import { z } from 'zod';
import {
  uiEventBus,
  executeComponentAction,
  UIEvent,
  piEventStream,
  AgentEvent,
  hookPipeline,
  sessionManager,
  telemetryTracker,
} from '@my-agent/core';
import { usePiSimulations } from './hooks/usePiSimulations';
import {
  HitlModal,
  PendingApproval,
  ReportsView,
  DashboardView,
  OAuthLoginModal,
  PiDiagnosticsView,
  HeaderBanner,
  AgentWidget,
} from './components';
import { useAgentRouter, useAgentChat, useAgentComponent } from '@my-agent/react';

export interface DemoAppProps {
  currentRoute?: string;
  onNavigate?: (route: string) => void;
}

export function DemoApp({ currentRoute = '/reports', onNavigate }: DemoAppProps) {
  const [stage, setStage] = useState<'CRITERIA' | 'RESULT'>('CRITERIA');
  const [storeId, setStoreId] = useState('');
  const [dateRange, setDateRange] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [testLogs, setTestLogs] = useState<string[]>([]);
  const [events, setEvents] = useState<UIEvent[]>([]);
  const [piEvents, setPiEvents] = useState<AgentEvent[]>([]);

  // Pi Özellik 1: Human-in-the-Loop (HITL) Onay Modalı
  const [hitlEnabled, setHitlEnabled] = useState(true);
  const [pendingApproval, setPendingApproval] = useState<PendingApproval | null>(null);
  const hitlEnabledRef = useRef(hitlEnabled);
  hitlEnabledRef.current = hitlEnabled;

  // Pi Özellik 5: Zaman Yolculuğu (Undo / Redo)
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  // Pi Özellik 7: Telemetri ve Maliyet Özeti
  const [telemetrySummary, setTelemetrySummary] = useState(telemetryTracker.getMetricsSummary());

  // Model Seçimi ve Maliyet Katsayısı
  const [models, setModels] = useState<any[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>('agnes-3.0-flash');
  const [isOAuthModalOpen, setIsOAuthModalOpen] = useState<boolean>(false);
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(true);
  const [dockOpen, setDockOpen] = useState<boolean>(false);
  const [locale, setLocale] = useState<'tr' | 'en'>('tr');

  // Paylaşılan Yula Chat Oturumu (Ana Ekran ile Dock arasında kesintisiz devamlılık)
  const chat = useAgentChat(currentRoute, {
    model: selectedModel,
    locale,
    onOpenLogin: () => setIsOAuthModalOpen(true),
    onSelectModel: (m) => setSelectedModel(m),
  });

  // Yula başka bir forma/sayfaya geçtiğinde (currentRoute !== '/') otomatik Dock modunda devam eder
  useEffect(() => {
    if (currentRoute !== '/') {
      setDockOpen(true);
    }
  }, [currentRoute]);

  const refreshModels = () => {
    fetch('/api/models')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.models && Array.isArray(data.models)) {
          setModels(data.models);
          if (data.defaultModel) {
            setSelectedModel((prev) => prev || data.defaultModel);
            const def = data.models.find((m: any) => m.id === (selectedModel || data.defaultModel));
            if (def?.cost) {
              telemetryTracker.setModelPricing(def.cost.input, def.cost.output);
            }
          }
        }
      })
      .catch(() => {});
  };

  useEffect(() => {
    refreshModels();
  }, []);

  const storeIdRef = useRef(storeId);
  const dateRangeRef = useRef(dateRange);
  storeIdRef.current = storeId;
  dateRangeRef.current = dateRange;

  const addLog = (msg: string) => {
    setTestLogs((prev) => [msg, ...prev.slice(0, 9)]);
  };

  const updateUndoRedoStatus = () => {
    setCanUndo(sessionManager.canUndo());
    setCanRedo(sessionManager.canRedo());
  };

  // Pi Router Bileşeni: Ajanın Event Bus üzerinden sayfa değiştirmesini sağlar
  useAgentRouter({
    currentRoute,
    onNavigate: (path) => {
      addLog(`🧭 [app_router]: Sayfa geçişi yapıldı -> "${path}"`);
      onNavigate?.(path);
      sessionManager.checkpoint(`Sayfa Değiştirildi (${path})`, { storeId, dateRange, stage, currentRoute: path });
      updateUndoRedoStatus();
    },
    onBack: () => {
      addLog(`🧭 [app_router]: Geri dönüldü -> "/"`);
      onNavigate?.('/');
    },
    availableRoutes: ['/', '/reports', '/dashboard', '/tests'],
  });

  // Pi Hook Entegrasyonu: beforeToolCall ile Human-in-the-Loop onayı
  useEffect(() => {
    const unsubHook = hookPipeline.beforeToolCall(async (ctx) => {
      if (hitlEnabledRef.current && ctx.args?.action === 'SUBMIT') {
        addLog(`🛡️ [beforeToolCall]: '${ctx.args.component_id}' SUBMIT eylemi için kullanıcı onayı bekleniyor...`);
        return new Promise((resolve) => {
          setPendingApproval({
            component_id: ctx.args.component_id,
            action: ctx.args.action,
            payload: ctx.args.payload,
            resolve: (approved: boolean) => {
              setPendingApproval(null);
              if (!approved) {
                addLog(`❌ [HITL]: Kullanıcı eylemi reddetti.`);
                resolve({ block: { reason: 'Kullanıcı onayı reddetti (Human-in-the-Loop Engellemesi)', terminate: true } });
              } else {
                addLog(`✅ [HITL]: Kullanıcı eylemi onayladı.`);
                resolve();
              }
            },
          });
        });
      }
    });

    const unsubRestore = sessionManager.onRestore((restored) => {
      if (restored.storeId !== undefined) setStoreId(restored.storeId);
      if (restored.dateRange !== undefined) setDateRange(restored.dateRange);
      if (restored.stage !== undefined) setStage(restored.stage);
      addLog(`⏳ [Zaman Yolculuğu]: Durum geri yüklendi -> Mağaza: ${restored.storeId || '-'}, Aşama: ${restored.stage}`);
      updateUndoRedoStatus();
    });

    return () => {
      unsubHook();
      unsubRestore();
    };
  }, []);

  useEffect(() => {
    setEvents(uiEventBus.getRecentEvents());
    const unsubTelemetry = uiEventBus.onTelemetry(() => {
      setEvents(uiEventBus.getRecentEvents());
    });

    setPiEvents(piEventStream.getHistory());
    const unsubPi = piEventStream.subscribe(() => {
      setPiEvents(piEventStream.getHistory());
      setTelemetrySummary(telemetryTracker.getMetricsSummary());
      updateUndoRedoStatus();
    });

    return () => {
      unsubTelemetry();
      unsubPi();
    };
  }, []);

  // 1. AŞAMA: Filtre Formu Kaydı
  useAgentComponent({
    id: 'filter_form',
    capabilities: ['SET_FIELDS', 'SUBMIT'],
    executionMode: 'sequential',
    meta: {
      description: 'Satış & Stok raporu oluşturma kriter formu.',
      currentValues: { storeId, dateRange },
    },
    actions: {
      SET_FIELDS: {
        description: 'Formdaki mağaza (storeId) ve dönem (dateRange) alanlarını günceller.',
        schema: z.object({
          storeId: z.string().min(1, 'storeId boş olamaz').optional(),
          dateRange: z.string().regex(/^\d{4}-\d{2}$/, 'Tarih formatı YYYY-AA (örn: 2026-09) olmalıdır').optional(),
        }),
        whenToCall: 'Kullanıcı mağaza veya dönem bilgisi belirttiğinde veya değiştirmek istediğinde.',
        whenNotToCall: 'Kullanıcı sadece mevcut filtreleri sorduğunda veya raporu onayladığında çağrılmamalıdır.',
      },
      SUBMIT: {
        description: 'Filtrelenmiş kriterlerle satış raporu üretimini başlatır.',
        schema: z.object({}).optional(),
        whenToCall: 'Hem storeId hem dateRange dolu olduğunda ve kullanıcı açıkça raporu çalıştırmak/görmek istediğinde.',
        whenNotToCall: 'Zorunlu alanlardan biri henüz boşsa veya kullanıcı sadece seçimleri değiştirmek istiyorsa ASLA çağrılmamalıdır.',
      },
    },
    onAction: (action, payload: any) => {
      addLog(`[filter_form Action]: ${action} ${payload ? JSON.stringify(payload) : ''}`);
      if (action === 'SET_FIELDS') {
        if (payload?.storeId !== undefined) {
          setStoreId(payload.storeId);
          storeIdRef.current = payload.storeId;
        }
        if (payload?.dateRange !== undefined) {
          setDateRange(payload.dateRange);
          dateRangeRef.current = payload.dateRange;
        }
        setValidationError(null);

        // Kullanıcı ana sayfada ('/') veya başka bir ekrandaysa, formu görebilmesi için raporlar sayfasına yönlendir
        if (currentRoute !== '/reports') {
          onNavigate?.('/reports');
          addLog(`🧭 [filter_form]: Filtre güncellendiği için '/reports' ekranına geçildi.`);
        }

        uiEventBus.recordTelemetry({
          source: 'filter_form',
          type: 'FIELDS_CHANGED',
          payload: { storeId: storeIdRef.current, dateRange: dateRangeRef.current },
        });

        sessionManager.checkpoint(`Alanlar Güncellendi (${payload.storeId || ''})`, {
          storeId: payload.storeId !== undefined ? payload.storeId : storeIdRef.current,
          dateRange: payload.dateRange !== undefined ? payload.dateRange : dateRangeRef.current,
          stage: 'CRITERIA',
        });
        updateUndoRedoStatus();
        return { success: true };
      }
      if (action === 'SUBMIT') {
        if (currentRoute !== '/reports') {
          onNavigate?.('/reports');
          addLog(`🧭 [filter_form]: Rapor çalıştırıldığı için '/reports' ekranına geçildi.`);
        }
        return handleGenerateReport();
      }
    },
  });

  // 2. AŞAMA: Validasyon ve Rapor Üretimi
  const handleGenerateReport = () => {
    const currentStore = storeIdRef.current;
    const currentDate = dateRangeRef.current;

    if (!currentStore || !currentDate) {
      const missingFields = [
        !currentStore ? 'storeId (Mağaza)' : null,
        !currentDate ? 'dateRange (Tarih Aralığı)' : null,
      ].filter(Boolean) as string[];

      uiEventBus.recordTelemetry({
        source: 'filter_form',
        type: 'VALIDATION_FAILED',
        payload: { missing: missingFields },
      });

      const errText = `Validasyon Hatası: Eksik alanlar (${missingFields.join(', ')}) doldurulmalıdır.`;
      setValidationError(errText);
      addLog(`⚠️ ${errText}`);
      return { success: false, error: errText, missing: missingFields };
    }

    setValidationError(null);
    setStage('RESULT');
    if (currentRoute !== '/reports') {
      onNavigate?.('/reports');
    }

    sessionManager.checkpoint(`Rapor Çalıştırıldı (${currentStore})`, {
      storeId: currentStore,
      dateRange: currentDate,
      stage: 'RESULT',
    });
    updateUndoRedoStatus();

    addLog(`✅ Rapor başarıyla oluşturuldu. Aşama -> RESULT (${currentStore})`);
    return { success: true, storeId: currentStore, dateRange: currentDate };
  };


  // Pi Simülasyon Testleri
  const {
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
  } = usePiSimulations({
    setStoreId,
    setDateRange,
    storeIdRef,
    dateRangeRef,
    handleGenerateReport,
    addLog,
  });

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        width: '100vw',
        overflow: 'hidden',
        background: '#0b132b',
        color: '#f8fafc',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      {pendingApproval && <HitlModal pendingApproval={pendingApproval} />}

      <OAuthLoginModal
        isOpen={isOAuthModalOpen}
        onClose={() => setIsOAuthModalOpen(false)}
        onSuccess={() => {
          setIsOAuthModalOpen(false);
          refreshModels();
        }}
      />

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '16px 20px', width: '100%', boxSizing: 'border-box' }}>
        <HeaderBanner
          hitlEnabled={hitlEnabled}
          onToggleHitl={setHitlEnabled}
          canUndo={canUndo}
          canRedo={canRedo}
          onUndo={() => {
            sessionManager.undo();
            updateUndoRedoStatus();
          }}
          onRedo={() => {
            sessionManager.redo();
            updateUndoRedoStatus();
          }}
          onNewConversation={() => {
            setStoreId('');
            setDateRange('');
            setStage('CRITERIA');
            sessionManager.checkpoint('Yeni Oturum Başlatıldı', { storeId: '', dateRange: '', stage: 'CRITERIA' });
            updateUndoRedoStatus();
            addLog('Yeni oturum başlatıldı, form sıfırlandı.');
          }}
          onDumpSession={() => {
            addLog('Oturum dump alındı.');
          }}
          onRestoreSession={() => {
            addLog('Oturum geri yüklendi.');
          }}
          telemetrySummary={telemetrySummary}
          contextUsage={chat.contextUsage}
          autoCompactEnabled={chat.autoCompactEnabled}
          onToggleAutoCompact={() => chat.setAutoCompactEnabled(!chat.autoCompactEnabled)}
          onManualCompact={() => chat.compact()}
          isCompacting={chat.isCompacting}
          selectedModel={selectedModel}
          availableModels={models.length > 0 ? models : chat.availableModels}
          onSelectModel={(m) => {
            setSelectedModel(m);
            chat.selectModel(m);
          }}
          onOpenLogin={() => setIsOAuthModalOpen(true)}
          locale={locale}
          onToggleLocale={() => setLocale((prev) => (prev === 'tr' ? 'en' : 'tr'))}
        />

        {/* Sekmeler Navigasyonu */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {[
            { route: '/reports', label: '📊 Raporlar & Form' },
            { route: '/dashboard', label: '📈 Dashboard' },
            { route: '/tests', label: '🧪 Pi Simülasyon Testleri' },
          ].map((tab) => (
            <button
              key={tab.route}
              type="button"
              onClick={() => onNavigate?.(tab.route)}
              style={{
                padding: '8px 16px',
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                border: currentRoute === tab.route ? '1px solid #3b82f6' : '1px solid #334155',
                backgroundColor: currentRoute === tab.route ? '#1e3a8a' : '#1e293b',
                color: currentRoute === tab.route ? '#ffffff' : '#94a3b8',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Ana İçerik */}
        <main>
          {currentRoute === '/reports' && (
            <ReportsView
              stage={stage}
              storeId={storeId}
              dateRange={dateRange}
              validationError={validationError}
              onStoreIdChange={(v) => {
                setStoreId(v);
                setValidationError(null);
              }}
              onDateRangeChange={(v) => {
                setDateRange(v);
                setValidationError(null);
              }}
              onSubmit={handleGenerateReport}
              onBackToCriteria={() => {
                setStage('CRITERIA');
                sessionManager.checkpoint('Kriterlere Geri Dönüldü', { storeId, dateRange, stage: 'CRITERIA' });
                updateUndoRedoStatus();
                addLog('Aşama geri alındı -> CRITERIA');
              }}
              onLog={addLog}
            />
          )}

          {currentRoute === '/dashboard' && (
            <div style={{ padding: 12 }}>
              <DashboardView onNavigateToReports={() => onNavigate?.('/reports')} />
            </div>
          )}

          {currentRoute === '/tests' && (
            <PiDiagnosticsView
              hitlEnabled={hitlEnabled}
              onSetFields={runPreflightTestValid}
              onSubmit={runPreflightTestSubmit}
              onSteer={triggerSteerSimulation}
              onFollowUp={triggerFollowUpSimulation}
              onTruncate={runTruncateTest}
              onMutationLine={runMutationLineTest}
              onAdaptivePublisher={runAdaptivePublisherTest}
              onRetry={runRetryTest}
              onMemory={runMemoryTest}
              onPlugin={runPluginTest}
              onLanes={runLanesTest}
              onDeferred={runDeferredTest}
              onReconcile={runReconcileTest}
              onRpc={runRpcTest}
              onVipCoupon={runVipCouponScenario}
              onLog={addLog}
              piEvents={piEvents}
              testLogs={testLogs}
              onClearLogs={() => setTestLogs([])}
            />
          )}
        </main>
      </div>

      <AgentWidget currentRoute={currentRoute} onOpenLogin={() => setIsOAuthModalOpen(true)} />
    </div>
  );
}
