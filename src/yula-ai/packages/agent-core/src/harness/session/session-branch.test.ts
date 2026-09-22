import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SessionBranchManager } from './session-branch';

describe('SessionBranchManager (Tree & Branching)', () => {
  let manager: SessionBranchManager;

  beforeEach(() => {
    manager = new SessionBranchManager();
  });

  describe('Basic Checkpoint & Time Travel', () => {
    it('initializes with main branch active', () => {
      const active = manager.getActiveBranch();
      expect(active.name).toBe('main');
      expect(active.checkpoints).toHaveLength(0);
      expect(manager.canUndo()).toBe(false);
      expect(manager.canRedo()).toBe(false);
    });

    it('records checkpoints and allows undo/redo', () => {
      const restoredStates: any[] = [];
      manager.onRestore((s) => restoredStates.push(s));

      manager.checkpoint('Step 1', { count: 1 });
      manager.checkpoint('Step 2', { count: 2 });
      manager.checkpoint('Step 3', { count: 3 });

      expect(manager.canUndo()).toBe(true);
      expect(manager.canRedo()).toBe(false);

      const undoTarget = manager.undo();
      expect(undoTarget?.label).toBe('Step 2');
      expect(undoTarget?.snapshot.state.count).toBe(2);
      expect(restoredStates.at(-1)?.count).toBe(2);
      expect(manager.canRedo()).toBe(true);

      const redoTarget = manager.redo();
      expect(redoTarget?.label).toBe('Step 3');
      expect(redoTarget?.snapshot.state.count).toBe(3);
    });

    it('discards redo history when a new checkpoint is added after undo', () => {
      manager.checkpoint('A', { val: 'a' });
      manager.checkpoint('B', { val: 'b' });
      manager.checkpoint('C', { val: 'c' });

      manager.undo(); // at B
      manager.checkpoint('D', { val: 'd' }); // replaces C

      const active = manager.getActiveBranch();
      expect(active.checkpoints.map((c) => c.label)).toEqual(['A', 'B', 'D']);
      expect(manager.canRedo()).toBe(false);
    });
  });

  describe('Hierarchical Forking & Tree Structure', () => {
    it('forks active branch preserving checkpoints and lineage', () => {
      const cp1 = manager.checkpoint('Init', { filter: 'store-1' });
      const cp2 = manager.checkpoint('Apply Date', { filter: 'store-1', date: '2026-01-01' });

      const featureBranch = manager.fork('scenario-a', {
        metadata: { author: 'tester', purpose: 'test-what-if' },
      });

      expect(featureBranch.name).toBe('scenario-a');
      expect(featureBranch.parentBranchId).toBe(manager.getBranch('main')?.id);
      expect(featureBranch.forkPointId).toBe(cp2.id);
      expect(featureBranch.metadata?.author).toBe('tester');
      expect(featureBranch.checkpoints).toHaveLength(2);
      expect(manager.getActiveBranch().name).toBe('scenario-a');
    });

    it('forks from a specific historical checkpoint ID', () => {
      const cp1 = manager.checkpoint('Cp 1', { step: 1 });
      const cp2 = manager.checkpoint('Cp 2', { step: 2 });
      const cp3 = manager.checkpoint('Cp 3', { step: 3 });

      const forked = manager.fork('branch-from-cp1', { fromCheckpointId: cp1.id });
      expect(forked.forkPointId).toBe(cp1.id);
      expect(forked.checkpoints).toHaveLength(1);
      expect(forked.checkpoints[0].id).toBe(cp1.id);
    });

    it('builds correct branch ancestry lineage', () => {
      manager.checkpoint('Root', { v: 0 });
      const branch1 = manager.fork('sub-1');
      manager.checkpoint('Sub-1 CP', { v: 1 });
      const branch2 = manager.fork('sub-2');

      const ancestry = manager.getBranchAncestry('sub-2');
      expect(ancestry.map((b) => b.name)).toEqual(['main', 'sub-1', 'sub-2']);
    });

    it('builds hierarchical branch tree', () => {
      manager.checkpoint('Root CP', {});
      manager.fork('child-1');
      manager.switchBranch('main');
      manager.fork('child-2');
      manager.fork('grandchild-1');

      const tree = manager.getBranchTree();
      expect(tree).toHaveLength(1); // root is 'main'
      expect(tree[0].branch.name).toBe('main');
      expect(tree[0].children).toHaveLength(2);

      const childNames = tree[0].children.map((n) => n.branch.name);
      expect(childNames).toContain('child-1');
      expect(childNames).toContain('child-2');

      const child2Node = tree[0].children.find((n) => n.branch.name === 'child-2');
      expect(child2Node?.children).toHaveLength(1);
      expect(child2Node?.children[0].branch.name).toBe('grandchild-1');
    });
  });

  describe('Branch Diffing', () => {
    it('accurately identifies common ancestor and unique checkpoints', () => {
      manager.checkpoint('Base 1', { filter: 'A', limit: 10 });
      const forkPoint = manager.checkpoint('Base 2', { filter: 'A', limit: 20 });

      manager.fork('experiment');
      manager.checkpoint('Exp 1', { filter: 'A', limit: 50 });
      manager.checkpoint('Exp 2', { filter: 'B', limit: 50 });

      manager.switchBranch('main');
      manager.checkpoint('Base 3', { filter: 'A', limit: 30 });

      const diff = manager.diffBranches('main', 'experiment');
      expect(diff.commonAncestorCheckpointId).toBe(forkPoint.id);
      expect(diff.baseOnlyCheckpoints.map((c) => c.label)).toEqual(['Base 3']);
      expect(diff.targetOnlyCheckpoints.map((c) => c.label)).toEqual(['Exp 1', 'Exp 2']);

      expect(diff.stateDiffSummary.changedKeys).toContain('filter');
      expect(diff.stateDiffSummary.changedKeys).toContain('limit');
      expect(diff.stateDiffSummary.baseState.limit).toBe(30);
      expect(diff.stateDiffSummary.targetState.limit).toBe(50);
    });
  });

  describe('Branch Merging', () => {
    it('squash merges changes from source into target branch', () => {
      manager.checkpoint('M1', { store: 101 });
      manager.fork('feature');
      manager.checkpoint('F1', { store: 101, year: 2025 });
      manager.checkpoint('F2', { store: 102, year: 2026, status: 'DONE' });

      manager.switchBranch('main');
      const mergedCp = manager.mergeBranch('feature', 'main', 'squash');

      expect(mergedCp?.label).toContain("Merge branch 'feature' into 'main'");
      expect(mergedCp?.snapshot.state).toEqual({
        store: 102,
        year: 2026,
        status: 'DONE',
      });
      expect(manager.getActiveBranch().checkpoints).toHaveLength(2); // M1 + Merged
    });

    it('fast-forward merges unique checkpoints into target branch', () => {
      manager.checkpoint('M1', { x: 1 });
      manager.fork('ff-branch');
      manager.checkpoint('FF1', { x: 2 });
      manager.checkpoint('FF2', { x: 3 });

      manager.switchBranch('main');
      const mergedCp = manager.mergeBranch('ff-branch', 'main', 'fast-forward');

      expect(mergedCp?.snapshot.state.x).toBe(3);
      const mainCheckpoints = manager.getBranch('main')?.checkpoints;
      expect(mainCheckpoints?.map((c) => c.label)).toEqual(['M1', 'FF1', 'FF2']);
    });
  });

  describe('Branch Management Operations', () => {
    it('renames branch successfully and updates active pointer', () => {
      manager.fork('draft-branch');
      expect(manager.getActiveBranch().name).toBe('draft-branch');

      const success = manager.renameBranch('draft-branch', 'final-branch');
      expect(success).toBe(true);
      expect(manager.getActiveBranch().name).toBe('final-branch');
      expect(manager.getBranch('draft-branch')).toBeUndefined();
      expect(manager.getBranch('final-branch')).toBeDefined();
    });

    it('prevents deleting main or currently active branch', () => {
      manager.fork('temp');
      expect(manager.deleteBranch('temp')).toBe(false); // active branch cannot be deleted
      expect(manager.deleteBranch('main')).toBe(false); // main cannot be deleted

      manager.switchBranch('main');
      expect(manager.deleteBranch('temp')).toBe(true); // now can be deleted
      expect(manager.getBranch('temp')).toBeUndefined();
    });

    it('resets all branches back to fresh main', () => {
      manager.checkpoint('Init', { a: 1 });
      manager.fork('b1');
      manager.fork('b2');

      manager.reset();
      expect(manager.getAllBranches()).toHaveLength(1);
      expect(manager.getActiveBranch().name).toBe('main');
      expect(manager.getActiveBranch().checkpoints).toHaveLength(0);
    });
  });
});
