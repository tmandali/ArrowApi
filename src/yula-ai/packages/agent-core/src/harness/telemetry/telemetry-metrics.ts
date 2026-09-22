import { TelemetryMetric } from '../../types';
import { piEventStream } from './pi-event-stream';

export interface TelemetrySummary {
  totalTurns: number;
  totalDurationMs: number;
  totalTokens: number;
  totalEstimatedCostUsd: number;
  averageTurnDurationMs: number;
}

/**
 * Pi-Style Structured Telemetry & Cost Accounting
 * Reference: earendil-works/pi/packages/agent/src/harness/telemetry.ts
 */
export class PiTelemetryTracker {
  private turnStartTimestamp: number = 0;
  private currentTurnIndex: number = 0;
  private toolInvocations: { name: string; success: boolean; durationMs: number }[] = [];
  private metricsHistory: TelemetryMetric[] = [];

  // Model fiyatlandırması (1M token başına $ / USD)
  private inputTokenPricePerMillion = 0.15;
  private outputTokenPricePerMillion = 0.60;

  setModelPricing(inputPricePerMillion: number, outputPricePerMillion: number): void {
    this.inputTokenPricePerMillion = Math.max(0, inputPricePerMillion);
    this.outputTokenPricePerMillion = Math.max(0, outputPricePerMillion);
  }

  getModelPricing(): { inputPricePerMillion: number; outputPricePerMillion: number } {
    return {
      inputPricePerMillion: this.inputTokenPricePerMillion,
      outputPricePerMillion: this.outputTokenPricePerMillion,
    };
  }

  reset(): void {
    this.turnStartTimestamp = 0;
    this.currentTurnIndex = 0;
    this.toolInvocations = [];
    this.metricsHistory = [];
  }

  startTurn(): void {
    this.turnStartTimestamp = Date.now();
    this.currentTurnIndex++;
    this.toolInvocations = [];
  }

  recordToolExecution(name: string, success: boolean, durationMs: number): void {
    this.toolInvocations.push({ name, success, durationMs });
  }

  endTurn(
    promptTokens: number = 0,
    completionTokens: number = 0,
    customPricing?: { input: number; output: number },
  ): TelemetryMetric {
    const durationMs = Math.max(1, Date.now() - this.turnStartTimestamp);
    const totalTokens = promptTokens + completionTokens;

    const inputRate = customPricing?.input ?? this.inputTokenPricePerMillion;
    const outputRate = customPricing?.output ?? this.outputTokenPricePerMillion;

    const estimatedCostUsd =
      (promptTokens / 1_000_000) * inputRate +
      (completionTokens / 1_000_000) * outputRate;

    const successfulTools = this.toolInvocations.filter((t) => t.success).length;
    const toolsSuccessRate =
      this.toolInvocations.length > 0 ? (successfulTools / this.toolInvocations.length) * 100 : 100;

    const metric: TelemetryMetric = {
      turnIndex: this.currentTurnIndex,
      durationMs,
      promptTokens,
      completionTokens,
      totalTokens,
      estimatedCostUsd: Number(estimatedCostUsd.toFixed(6)),
      toolsExecutedCount: this.toolInvocations.length,
      toolsSuccessRate: Number(toolsSuccessRate.toFixed(1)),
    };

    this.metricsHistory.push(metric);

    piEventStream.emit({
      type: 'telemetry_metric',
      metric,
    });

    return metric;
  }

  getMetricsSummary(): {
    totalTurns: number;
    totalDurationMs: number;
    totalTokens: number;
    totalEstimatedCostUsd: number;
    averageTurnDurationMs: number;
  } {
    const totalTurns = this.metricsHistory.length;
    const totalDurationMs = this.metricsHistory.reduce((acc, m) => acc + m.durationMs, 0);
    const totalTokens = this.metricsHistory.reduce((acc, m) => acc + m.totalTokens, 0);
    const totalEstimatedCostUsd = this.metricsHistory.reduce((acc, m) => acc + m.estimatedCostUsd, 0);
    const averageTurnDurationMs = totalTurns > 0 ? Math.round(totalDurationMs / totalTurns) : 0;

    return {
      totalTurns,
      totalDurationMs,
      totalTokens,
      totalEstimatedCostUsd: Number(totalEstimatedCostUsd.toFixed(6)),
      averageTurnDurationMs,
    };
  }

  getHistory(): TelemetryMetric[] {
    return [...this.metricsHistory];
  }
}

export const telemetryTracker = new PiTelemetryTracker();
