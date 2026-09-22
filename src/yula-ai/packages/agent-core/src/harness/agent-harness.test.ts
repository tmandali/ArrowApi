import { describe, it, expect, beforeEach } from 'vitest';
import { AgentHarness, createAgentHarness, agentHarness } from './agent-harness';

describe('AgentHarness Facade', () => {
  let harness: AgentHarness;

  beforeEach(() => {
    harness = createAgentHarness();
    harness.reset();
  });

  it('exposes all 8 subsystems with typed submodules', () => {
    expect(harness.session).toBeDefined();
    expect(harness.runtime).toBeDefined();
    expect(harness.compaction).toBeDefined();
    expect(harness.ui).toBeDefined();
    expect(harness.tools).toBeDefined();
    expect(harness.knowledge).toBeDefined();
    expect(harness.telemetry).toBeDefined();
    expect(harness.extensions).toBeDefined();
  });

  it('provides singleton agentHarness instance', () => {
    expect(agentHarness).toBeInstanceOf(AgentHarness);
  });

  it('dumps and restores session snapshot', () => {
    const messages = [{ role: 'user', content: 'test message' }];
    const dump = harness.dump(messages);

    expect(dump).toBeDefined();
    expect(dump.sessionId).toMatch(/^session_/);
    expect(dump.messages).toEqual(messages);

    // Restore should succeed without throwing
    expect(() => harness.restore(dump)).not.toThrow();
  });

  it('generates health report with active branch and triage summary', () => {
    const report = harness.getHealthReport();

    expect(report.status).toBe('healthy');
    expect(report.activeBranch).toBe('main');
    expect(report.memoryCount).toBe(0);
    expect(report.eventCount).toBe(0);
    expect(Array.isArray(report.registeredComponents)).toBe(true);
  });

  it('resets memory, eventBus and telemetry upon reset()', () => {
    harness.session.memory.remember('favorite_color', 'blue');
    expect(harness.session.memory.getAll().length).toBe(1);

    harness.reset();
    expect(harness.session.memory.getAll().length).toBe(0);
    expect(harness.ui.eventBus.getRecentEvents().length).toBe(0);
  });

  it('exports audit report string via exportAuditReport()', () => {
    const html = harness.exportAuditReport([]);
    expect(typeof html).toBe('string');
    expect(html).toContain('<!DOCTYPE html>');
  });
});
