import { useState, useEffect, useCallback } from 'react';
import { AgentHarness, agentHarness, type SessionDump } from '@my-agent/core';

export interface UseAgentHarnessOptions {
  harness?: AgentHarness;
  autoRefreshOnEvents?: boolean;
}

/**
 * React hook providing reactive telemetry, health monitoring, and lifecycle management
 * for the AgentHarness subsystems.
 */
export function useAgentHarness(options: UseAgentHarnessOptions = {}) {
  const harness = options.harness ?? agentHarness;
  const autoRefresh = options.autoRefreshOnEvents ?? true;
  const [health, setHealth] = useState(() => harness.getHealthReport());

  const refreshHealth = useCallback(() => {
    setHealth(harness.getHealthReport());
  }, [harness]);

  useEffect(() => {
    if (!autoRefresh) return;

    // Refresh health when telemetry events occur
    const unsubEvent = harness.ui.eventBus.onTelemetry(() => {
      refreshHealth();
    });

    // Refresh health when turn metrics arrive
    const unsubStream = harness.telemetry.stream.subscribe(() => {
      refreshHealth();
    });

    return () => {
      unsubEvent();
      unsubStream();
    };
  }, [harness, autoRefresh, refreshHealth]);

  const dump = useCallback(
    (messages: any[] = [], uiState?: Record<string, any>): SessionDump => {
      return harness.dump(messages, uiState);
    },
    [harness],
  );

  const restore = useCallback(
    (snapshot: SessionDump) => {
      harness.restore(snapshot);
      refreshHealth();
    },
    [harness, refreshHealth],
  );

  const reset = useCallback(() => {
    harness.reset();
    refreshHealth();
  }, [harness, refreshHealth]);

  const exportAuditReport = useCallback(
    (messages: any[] = []): string => {
      return harness.exportAuditReport(messages);
    },
    [harness],
  );

  return {
    harness,
    health,
    refreshHealth,
    dump,
    restore,
    reset,
    exportAuditReport,
  };
}
