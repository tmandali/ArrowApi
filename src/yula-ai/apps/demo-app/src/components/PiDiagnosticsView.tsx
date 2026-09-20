import React from 'react';
import { AgentEvent } from '@my-agent/core';
import {
  PiTestPanel,
  PiEventWaterfall,
  ActionLogViewer,
  ProgressDemo,
  ReplayScrubber,
  EvalsRunnerView,
  VisionAndStorageDemo,
  PluginShowcaseCard,
} from './index';

export interface PiDiagnosticsViewProps {
  hitlEnabled: boolean;
  onSetFields: () => void;
  onSubmit: () => void;
  onSteer: () => void;
  onFollowUp: () => void;
  onTruncate: () => void;
  onMutationLine: () => void;
  onAdaptivePublisher: () => void;
  onRetry: () => void;
  onMemory: () => void;
  onPlugin: () => void;
  onLanes: () => void;
  onDeferred: () => void;
  onReconcile: () => void;
  onRpc: () => void;
  onVipCoupon: () => void;
  onAutonomousLoop?: () => void;
  onUserChoice?: () => void;
  onStagnation?: () => void;
  onCompaction?: () => void;
  onForkClone?: () => void;
  onExportHtml?: () => void;
  onStreamingUpdate?: () => void;
  onSessionRetry?: () => void;
  onToolLoadoutDelta?: () => void;
  onModelCascading?: () => void;
  onProviderFailover?: () => void;
  onStepRouting?: () => void;
  onLog: (msg: string) => void;
  piEvents: AgentEvent[];
  testLogs: string[];
  onClearLogs: () => void;
}

export const PiDiagnosticsView: React.FC<PiDiagnosticsViewProps> = ({
  hitlEnabled,
  onSetFields,
  onSubmit,
  onSteer,
  onFollowUp,
  onTruncate,
  onMutationLine,
  onAdaptivePublisher,
  onRetry,
  onMemory,
  onPlugin,
  onLanes,
  onDeferred,
  onReconcile,
  onRpc,
  onVipCoupon,
  onAutonomousLoop,
  onUserChoice,
  onStagnation,
  onCompaction,
  onForkClone,
  onExportHtml,
  onStreamingUpdate,
  onSessionRetry,
  onToolLoadoutDelta,
  onModelCascading,
  onProviderFailover,
  onStepRouting,
  onLog,
  piEvents,
  testLogs,
  onClearLogs,
}) => {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: 20, height: '100%', overflowY: 'auto', padding: 20 }}>
      {/* Sol Sütun: Simülasyon Testleri ve Kartlar */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ background: '#162238', border: '1px solid #233352', borderRadius: 12, padding: 16 }}>
          <h2 style={{ margin: '0 0 12px 0', fontSize: 16, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>🧪</span> Otonom Ajan Döngüsü & Pi Test Paneli (27 Yetenek)
          </h2>
          <PiTestPanel
            hitlEnabled={hitlEnabled}
            onSetFields={onSetFields}
            onSubmit={onSubmit}
            onSteer={onSteer}
            onFollowUp={onFollowUp}
            onTruncate={onTruncate}
            onMutationLine={onMutationLine}
            onAdaptivePublisher={onAdaptivePublisher}
            onRetry={onRetry}
            onMemory={onMemory}
            onPlugin={onPlugin}
            onLanes={onLanes}
            onDeferred={onDeferred}
            onReconcile={onReconcile}
            onRpc={onRpc}
            onVipCoupon={onVipCoupon}
            onAutonomousLoop={onAutonomousLoop}
            onUserChoice={onUserChoice}
            onStagnation={onStagnation}
            onCompaction={onCompaction}
            onForkClone={onForkClone}
            onExportHtml={onExportHtml}
            onStreamingUpdate={onStreamingUpdate}
            onSessionRetry={onSessionRetry}
            onToolLoadoutDelta={onToolLoadoutDelta}
            onModelCascading={onModelCascading}
            onProviderFailover={onProviderFailover}
            onStepRouting={onStepRouting}
          />
        </div>

        <PluginShowcaseCard onLog={onLog} />
        <ProgressDemo />
        <ReplayScrubber />
        <EvalsRunnerView />
        <VisionAndStorageDemo />
      </div>

      {/* Sağ Sütun: Olay Şelalesi ve Log Konsolu */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <PiEventWaterfall events={piEvents} />
        <ActionLogViewer logs={testLogs} onClear={onClearLogs} />
      </div>
    </div>
  );
};
