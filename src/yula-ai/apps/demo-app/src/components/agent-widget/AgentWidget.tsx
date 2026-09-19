import React, { useState, useEffect } from 'react';
import { useAgentChat, useAgentProgress } from '@my-agent/react';
import {
  piEventStream,
  AgentEvent,
  sessionManager,
  telemetryTracker,
  SessionCheckpoint,
  MemoryEntry,
} from '@my-agent/core';
import {
  WidgetHeader,
  WidgetTab,
  ChatTab,
  PiEventsTab,
  SkillsTab,
  MemoryTab,
  SteeringTab,
  SessionsTab,
  MetricsTab,
} from './index';

export function AgentWidget({
  position = 'bottom-right',
  currentRoute,
  onOpenLogin,
}: {
  position?: 'bottom-right' | 'bottom-left';
  currentRoute?: string;
  onOpenLogin?: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<WidgetTab>('chat');
  const [piEvents, setPiEvents] = useState<AgentEvent[]>([]);
  const [checkpoints, setCheckpoints] = useState<SessionCheckpoint[]>([]);
  const [summary, setSummary] = useState(telemetryTracker.getMetricsSummary());
  const [memories, setMemories] = useState<MemoryEntry[]>([]);
  const { activeProgress } = useAgentProgress();

  const resolvedRoute = currentRoute || (typeof window !== 'undefined' ? window.location.pathname : '/');

  const {
    messages,
    input,
    handleInputChange,
    handleSubmit,
    isLoading,
    runSlashCommand,
    steer,
    followUp,
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
    forget,
    getMemories,
    chooseOption,
    contextUsage,
    autoCompactEnabled,
    setAutoCompactEnabled,
    isCompacting,
    compact,
    selectedModel,
    selectedProvider,
    availableModels,
    selectModel,
  } = useAgentChat(resolvedRoute, { onOpenLogin });

  useEffect(() => {
    setMemories(getMemories());
  }, [isOpen, activeTab]);

  useEffect(() => {
    setPiEvents(piEventStream.getHistory());
    const unsubPi = piEventStream.subscribe(() => {
      setPiEvents(piEventStream.getHistory());
      setSummary(telemetryTracker.getMetricsSummary());
      setCheckpoints(sessionManager.getActiveBranch().checkpoints);
    });

    return () => {
      unsubPi();
    };
  }, []);

  const containerStyle: React.CSSProperties = {
    position: 'fixed',
    bottom: 24,
    [position === 'bottom-right' ? 'right' : 'left']: 24,
    zIndex: 9999,
    fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  };

  const panelStyle: React.CSSProperties = {
    width: 460,
    height: 580,
    backgroundColor: '#ffffff',
    borderRadius: 14,
    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.15), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    border: '1px solid #cbd5e1',
    marginBottom: 12,
  };

  const handleRestore = (jsonText: string) => {
    const res = restoreSession(jsonText);
    if (res.success) {
      alert('✅ Oturum dump dosyası başarıyla yüklendi!');
      setMemories(getMemories());
    } else {
      alert(`❌ Hata: ${res.error}`);
    }
  };

  return (
    <div style={containerStyle}>
      {isOpen && (
        <div style={panelStyle}>
          <WidgetHeader
            activeTab={activeTab}
            onSelectTab={setActiveTab}
            onClose={() => setIsOpen(false)}
            onNewConversation={newConversation}
            onDumpSession={() => dumpSession()}
            onRestoreSession={handleRestore}
            piEventsCount={piEvents.length}
            skillsCount={activeSkills.length}
            memoryCount={memories.length}
            contextUsage={contextUsage}
            autoCompactEnabled={autoCompactEnabled}
            onToggleAutoCompact={() => setAutoCompactEnabled(!autoCompactEnabled)}
            onManualCompact={() => compact(undefined, 'manual')}
            isCompacting={isCompacting}
            selectedModel={selectedModel}
            selectedProvider={selectedProvider}
            availableModels={availableModels}
            onSelectModel={selectModel}
            onOpenLogin={onOpenLogin}
          />

          {activeProgress.length > 0 && (
            <div style={{ backgroundColor: '#1e293b', borderBottom: '1px solid #334155', padding: '6px 12px' }}>
              {activeProgress.map((p) => (
                <div key={p.toolCallId} style={{ fontSize: 11, color: '#38bdf8', marginBottom: 4 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                    <span>⚙️ {p.toolName}: {p.message}</span>
                    <span style={{ fontWeight: 700 }}>%{p.percentage}</span>
                  </div>
                  <div style={{ width: '100%', height: 4, backgroundColor: '#0f172a', borderRadius: 2, overflow: 'hidden' }}>
                    <div
                      style={{
                        width: `${p.percentage}%`,
                        height: '100%',
                        backgroundColor: '#38bdf8',
                        transition: 'width 0.2s ease',
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'chat' && (
            <ChatTab
              messages={messages}
              isLoading={isLoading}
              input={input}
              onInputChange={handleInputChange}
              onSubmit={handleSubmit}
              templates={templates}
              onRunSlashCommand={runSlashCommand}
              onSelectChoice={chooseOption}
            />
          )}

          {activeTab === 'pi-events' && <PiEventsTab events={piEvents} />}

          {activeTab === 'skills' && (
            <SkillsTab
              activeSkills={activeSkills}
              templates={templates}
              onRunSlashCommand={(cmd) => {
                setActiveTab('chat');
                runSlashCommand(cmd);
              }}
            />
          )}

          {activeTab === 'memory' && (
            <MemoryTab
              memories={memories}
              onRemember={remember}
              onForget={forget}
              onRefresh={() => setMemories(getMemories())}
            />
          )}

          {activeTab === 'steering' && <SteeringTab onSteer={steer} onFollowUp={followUp} />}

          {activeTab === 'sessions' && (
            <SessionsTab
              checkpoints={checkpoints}
              canUndo={canUndo}
              canRedo={canRedo}
              onUndo={undo}
              onRedo={redo}
            />
          )}

          {activeTab === 'metrics' && <MetricsTab summary={summary} contextUsage={contextUsage} />}
        </div>
      )}

      {/* Floating Toggle Button */}
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        style={{
          padding: '12px 20px',
          borderRadius: 30,
          backgroundColor: '#2563eb',
          color: '#ffffff',
          border: 'none',
          cursor: 'pointer',
          fontWeight: 600,
          fontSize: 14,
          boxShadow: '0 4px 14px rgba(37, 99, 235, 0.4)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        {isOpen ? '✕ Kapat' : '💬 Asistan & Pi Mimarisi'}
      </button>
    </div>
  );
}
