/**
 * AgentHarness - Unified Facade for UI-Agent Subsystems.
 * Reference: reference-pi/packages/agent/src/harness/agent-harness.ts
 *
 * Responsibilities:
 * 1. Single entrypoint coordinating session, runtime, compaction, UI bridge, tools, knowledge, telemetry, and extensions.
 * 2. Diagnostic bundle generation and health triage across all subsystems.
 * 3. Coordinated reset, export, and restore operations.
 */

import type { ComponentSchema } from '../types';
import { sessionHarness, SessionHarness, type SessionDump } from './session/session-harness';
import { sessionManager, SessionBranchManager } from './session/session-branch';
import { agentMemory, AgentMemory } from './session/memory';
import { multiLaneScheduler, MultiLaneScheduler } from './runtime/lanes';
import { durableLane, DurableLaneManager } from './runtime/durable-lane';
import { executionCoordinator, ActionExecutionCoordinator } from './runtime/execution-queue';
import { createGate } from './runtime/effect-gate';
import { compactConversation, compactUIEvents } from './compaction/compaction';
import { truncateContent } from './compaction/truncate';
import { uiEventBus, UIEventBus } from './ui-bridge/event-bus';
import { uiRegistry, UIComponentRegistry } from './ui-bridge/component-registry';
import { visionBridge, VisionBridge } from './ui-bridge/vision-bridge';
import { agentUiTools, executeComponentAction } from './tools/standard-tools';
import { delegatedToolRegistry, DelegatedToolRegistry } from './tools/ui-delegation';
import { skillsManager, SkillRegistry } from './knowledge/skills';
import { playbookManager, PlaybookService } from './knowledge/playbook';
import { telemetryTracker, PiTelemetryTracker } from './telemetry/telemetry-metrics';
import { piEventStream, PiEventStream } from './telemetry/pi-event-stream';
import {
  diagnosticRetryGuard,
  DiagnosticRetryGuard,
  classifyDiagnosticError,
} from './telemetry/diagnostic-triage';
import { exportSessionToHtml } from './telemetry/export-html';
import { hookPipeline, HookPipeline } from './extensions/hooks';
import { pluginRegistry, PluginRegistry } from './extensions/plugins';

export interface AgentHarnessConfig {
  sessionId?: string;
  sessionHarness?: SessionHarness;
  sessionManager?: SessionBranchManager;
  memory?: AgentMemory;
  laneScheduler?: MultiLaneScheduler;
  durableLane?: DurableLaneManager;
  executionCoordinator?: ActionExecutionCoordinator;
  uiEventBus?: UIEventBus;
  uiRegistry?: UIComponentRegistry;
  visionBridge?: VisionBridge;
  delegatedTools?: DelegatedToolRegistry;
  skillRegistry?: SkillRegistry;
  playbookManager?: PlaybookService;
  telemetry?: PiTelemetryTracker;
  eventStream?: PiEventStream;
  retryGuard?: DiagnosticRetryGuard;
  hooks?: HookPipeline;
  plugins?: PluginRegistry;
}

export class AgentHarness {
  readonly session: {
    readonly harness: SessionHarness;
    readonly manager: SessionBranchManager;
    readonly memory: AgentMemory;
  };

  readonly runtime: {
    readonly lanes: MultiLaneScheduler;
    readonly durable: DurableLaneManager;
    readonly coordinator: ActionExecutionCoordinator;
    readonly createGate: typeof createGate;
  };

  readonly compaction: {
    readonly compact: typeof compactConversation;
    readonly compactUI: typeof compactUIEvents;
    readonly truncate: typeof truncateContent;
  };

  readonly ui: {
    readonly eventBus: UIEventBus;
    readonly registry: UIComponentRegistry;
    readonly vision: VisionBridge;
  };

  readonly tools: {
    readonly standard: typeof agentUiTools;
    readonly executeAction: typeof executeComponentAction;
    readonly delegated: DelegatedToolRegistry;
  };

  readonly knowledge: {
    readonly skills: SkillRegistry;
    readonly playbook: PlaybookService;
  };

  readonly telemetry: {
    readonly tracker: PiTelemetryTracker;
    readonly stream: PiEventStream;
    readonly retryGuard: DiagnosticRetryGuard;
    readonly classifyError: typeof classifyDiagnosticError;
    readonly exportHtml: typeof exportSessionToHtml;
  };

  readonly extensions: {
    readonly hooks: HookPipeline;
    readonly plugins: PluginRegistry;
  };

  constructor(config: AgentHarnessConfig = {}) {
    this.session = {
      harness: config.sessionHarness ?? sessionHarness,
      manager: config.sessionManager ?? sessionManager,
      memory: config.memory ?? agentMemory,
    };

    this.runtime = {
      lanes: config.laneScheduler ?? multiLaneScheduler,
      durable: config.durableLane ?? durableLane,
      coordinator: config.executionCoordinator ?? executionCoordinator,
      createGate,
    };

    this.compaction = {
      compact: compactConversation,
      compactUI: compactUIEvents,
      truncate: truncateContent,
    };

    this.ui = {
      eventBus: config.uiEventBus ?? uiEventBus,
      registry: config.uiRegistry ?? uiRegistry,
      vision: config.visionBridge ?? visionBridge,
    };

    this.tools = {
      standard: agentUiTools,
      executeAction: executeComponentAction,
      delegated: config.delegatedTools ?? delegatedToolRegistry,
    };

    this.knowledge = {
      skills: config.skillRegistry ?? skillsManager,
      playbook: config.playbookManager ?? playbookManager,
    };

    this.telemetry = {
      tracker: config.telemetry ?? telemetryTracker,
      stream: config.eventStream ?? piEventStream,
      retryGuard: config.retryGuard ?? diagnosticRetryGuard,
      classifyError: classifyDiagnosticError,
      exportHtml: exportSessionToHtml,
    };

    this.extensions = {
      hooks: config.hooks ?? hookPipeline,
      plugins: config.plugins ?? pluginRegistry,
    };
  }

  /**
   * Produce a complete JSON snapshot of the session state.
   */
  dump(messages: any[] = [], uiState?: Record<string, any>): SessionDump {
    return this.session.harness.dumpSession(messages, uiState);
  }

  /**
   * Restore session state from a dump object.
   */
  restore(dump: SessionDump): void {
    this.session.harness.restoreSession(dump);
  }

  /**
   * Reset all volatile states across session, telemetry, memory and lanes.
   */
  reset(): void {
    this.session.harness.reset();
    this.session.memory.clear();
    this.ui.eventBus.clear();
    this.telemetry.tracker.reset();
  }

  /**
   * Run automated health triage across event bus, telemetry, and memory.
   */
  getHealthReport() {
    const memoryEntries = this.session.memory.getAll();
    const telemetrySummary = this.telemetry.tracker.getMetricsSummary();
    const recentEvents = this.ui.eventBus.getRecentEvents();
    const criticalEvents = recentEvents.filter((e) => e.severity === 'critical');

    return {
      status: criticalEvents.length > 0 ? ('degraded' as const) : ('healthy' as const),
      criticalEventsCount: criticalEvents.length,
      telemetry: telemetrySummary,
      memoryCount: memoryEntries.length,
      eventCount: recentEvents.length,
      activeBranch: this.session.manager.getActiveBranch().name,
      registeredComponents: this.ui.registry
        .getActiveComponents()
        .map((c: ComponentSchema) => c.id),
    };
  }

  /**
   * Generate a standalone HTML audit bundle.
   */
  exportAuditReport(messages: any[] = []): string {
    const dump = this.dump(messages);
    return this.telemetry.exportHtml(dump);
  }
}

/** Singleton default harness instance */
export const agentHarness = new AgentHarness();

/** Factory function to create custom isolated harness instances */
export function createAgentHarness(config?: AgentHarnessConfig): AgentHarness {
  return new AgentHarness(config);
}
