import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  DurableLaneManager,
  MemoryDurableStorageDriver,
} from './durable-lane';

describe('DurableLaneManager', () => {
  let lane: DurableLaneManager;
  let storage: MemoryDurableStorageDriver;

  beforeEach(() => {
    storage = new MemoryDurableStorageDriver();
    lane = new DurableLaneManager(storage);
  });

  describe('Task Submission & Idempotency', () => {
    it('creates a new durable task with pending status', async () => {
      const task = await lane.submitTask({
        kind: 'arrow_job',
        input: { reportType: 'sales', branch: 'ist-1' },
      });

      expect(task.id).toBeDefined();
      expect(task.kind).toBe('arrow_job');
      expect(task.status).toBe('pending');
      expect(task.retryCount).toBe(0);

      const retrieved = await lane.getTask(task.id);
      expect(retrieved?.input).toEqual({ reportType: 'sales', branch: 'ist-1' });
    });

    it('returns existing task when identical idempotencyKey is used', async () => {
      const task1 = await lane.submitTask({
        kind: 'duckdb_ingest',
        input: { table: 'inventory' },
        idempotencyKey: 'idem_inv_sync',
      });

      const task2 = await lane.submitTask({
        kind: 'duckdb_ingest',
        input: { table: 'inventory_other' },
        idempotencyKey: 'idem_inv_sync',
      });

      expect(task1.id).toBe(task2.id);
    });
  });

  describe('Execution, Checkpoints & Memos', () => {
    it('runs registered task and saves progress checkpoints', async () => {
      lane.registerRunner('arrow_job', async (ctx) => {
        await ctx.saveCheckpoint({ progressPct: 30, stage: 'querying_backend' });
        await ctx.setMemo('remoteJobId', 'job_arrow_123');
        await ctx.saveCheckpoint({ progressPct: 80, stage: 'formatting_result' });

        return { rowCount: 1500, timeTakenMs: 45 };
      });

      const task = await lane.submitTask({
        kind: 'arrow_job',
        input: { query: 'SELECT * FROM sales' },
      });

      const result = await lane.runTask(task.id);
      expect(result).toEqual({ rowCount: 1500, timeTakenMs: 45 });

      const updated = await lane.getTask(task.id);
      expect(updated?.status).toBe('completed');
      expect(updated?.result).toEqual({ rowCount: 1500, timeTakenMs: 45 });
      expect(updated?.checkpoint?.progressPct).toBe(100);
      expect(updated?.checkpoint?.stage).toBe('completed');
      expect(updated?.memos.remoteJobId).toBe('job_arrow_123');
    });

    it('handles runner errors and manages retry limit', async () => {
      let callCount = 0;
      lane.registerRunner('flaky_task', async () => {
        callCount++;
        throw new Error('Connection timeout');
      });

      const task = await lane.submitTask({
        kind: 'flaky_task',
        input: {},
        maxRetries: 1,
      });

      // First failure: retryCount -> 1, status remains pending
      await expect(lane.runTask(task.id)).rejects.toThrow('Connection timeout');
      let current = await lane.getTask(task.id);
      expect(current?.retryCount).toBe(1);
      expect(current?.status).toBe('pending');

      // Second failure: retryCount exceeds maxRetries (1), status -> failed
      await expect(lane.runTask(task.id)).rejects.toThrow('Connection timeout');
      current = await lane.getTask(task.id);
      expect(current?.status).toBe('failed');
      expect(current?.error?.message).toBe('Connection timeout');
    });

    it('supports aborting an active task via signal', async () => {
      lane.registerRunner('slow_task', async (ctx) => {
        return new Promise((resolve, reject) => {
          if (ctx.signal.aborted) {
            return reject(new Error('Operation cancelled by user'));
          }
          ctx.signal.addEventListener('abort', () => {
            reject(new Error('Operation cancelled by user'));
          });
        });
      });

      const task = await lane.submitTask({ kind: 'slow_task', input: {} });

      const runPromise = lane.runTask(task.id);
      // Abort midway
      lane.abortTask(task.id, 'User clicked stop');

      await expect(runPromise).rejects.toThrow();

      const aborted = await lane.getTask(task.id);
      expect(aborted?.status).toBe('aborted');
    });
  });

  describe('Crash & Interruption Recovery', () => {
    it('detects and marks running tasks as interrupted on crash recovery', async () => {
      const task1 = await lane.submitTask({ kind: 'job_a', input: {} });
      const task2 = await lane.submitTask({ kind: 'job_b', input: {} });

      // Simulate tasks running when system crashed
      task1.status = 'running';
      await storage.saveTask(task1);

      task2.status = 'pending';
      await storage.saveTask(task2);

      const interrupted = await lane.recoverInterruptedTasks(false);
      expect(interrupted).toHaveLength(2);

      const recovered1 = await lane.getTask(task1.id);
      expect(recovered1?.status).toBe('interrupted');
      expect(recovered1?.error?.message).toContain('terminated unexpectedly');
    });

    it('auto-resumes interrupted tasks if runner is registered and autoResume=true', async () => {
      let resumed = false;
      lane.registerRunner('resumable_job', async (ctx) => {
        resumed = true;
        return { restored: true };
      });

      const task = await lane.submitTask({ kind: 'resumable_job', input: {} });
      task.status = 'running';
      await storage.saveTask(task);

      await lane.recoverInterruptedTasks(true);

      // Wait a tick for async background execution
      await new Promise((r) => setTimeout(r, 50));
      expect(resumed).toBe(true);

      const finalTask = await lane.getTask(task.id);
      expect(finalTask?.status).toBe('completed');
      expect(finalTask?.result).toEqual({ restored: true });
    });
  });
});
