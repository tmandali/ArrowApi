import { SessionCheckpoint, SessionBranch } from '../../types';
import { uiEventBus } from '../ui-bridge/event-bus';
import { piEventStream } from '../telemetry/pi-event-stream';

export type StateRestoreHandler = (state: Record<string, any>) => void;

export interface BranchTreeNode {
  branch: SessionBranch;
  children: BranchTreeNode[];
}

export interface BranchDiffResult {
  baseBranch: string;
  targetBranch: string;
  commonAncestorCheckpointId?: string;
  baseOnlyCheckpoints: SessionCheckpoint[];
  targetOnlyCheckpoints: SessionCheckpoint[];
  stateDiffSummary: {
    changedKeys: string[];
    baseState: Record<string, any>;
    targetState: Record<string, any>;
  };
}

export interface ForkOptions {
  fromCheckpointId?: string;
  metadata?: Record<string, any>;
}

export interface CreateBranchOptions {
  parentBranchId?: string;
  forkPointId?: string;
  metadata?: Record<string, any>;
}

/**
 * Pi-Style Session Branching, Checkpointing, Tree Lineage & Time-Travel (Undo/Redo)
 * Reference: earendil-works/pi/packages/agent/src/harness/session/
 */
export class SessionBranchManager {
  private branches: Map<string, SessionBranch> = new Map();
  private activeBranchName = 'main';
  private restoreHandlers: Set<StateRestoreHandler> = new Set();
  private listeners: Set<() => void> = new Set();

  constructor() {
    this.createBranch('main');
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    this.listeners.forEach((listener) => {
      try {
        listener();
      } catch (err) {
        console.error('[SessionBranchManager] Listener error:', err);
      }
    });
  }

  onRestore(handler: StateRestoreHandler): () => void {
    this.restoreHandlers.add(handler);
    return () => {
      this.restoreHandlers.delete(handler);
    };
  }

  createBranch(name: string, options?: CreateBranchOptions): SessionBranch {
    const branch: SessionBranch = {
      id: `branch_${Date.now()}_${name.replace(/[^a-zA-Z0-9_-]/g, '_')}_${Math.random().toString(36).slice(2, 6)}`,
      name,
      createdAt: Date.now(),
      checkpoints: [],
      currentIndex: -1,
      parentBranchId: options?.parentBranchId,
      forkPointId: options?.forkPointId,
      metadata: options?.metadata ? { ...options.metadata } : undefined,
    };
    this.branches.set(name, branch);
    return branch;
  }

  getBranch(name: string): SessionBranch | undefined {
    return this.branches.get(name);
  }

  getBranchById(id: string): SessionBranch | undefined {
    return Array.from(this.branches.values()).find((b) => b.id === id);
  }

  getActiveBranch(): SessionBranch {
    let branch = this.branches.get(this.activeBranchName);
    if (!branch) {
      branch = this.createBranch('main');
      this.activeBranchName = 'main';
    }
    return branch;
  }

  checkpoint(label: string, state: Record<string, any>, route: string = '/'): SessionCheckpoint {
    const branch = this.getActiveBranch();
    const cp: SessionCheckpoint = {
      id: `cp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      label,
      timestamp: Date.now(),
      snapshot: {
        route,
        state: JSON.parse(JSON.stringify(state)),
        events: uiEventBus.getRecentEvents(),
      },
    };

    branch.checkpoints = branch.checkpoints.slice(0, branch.currentIndex + 1);
    branch.checkpoints.push(cp);
    branch.currentIndex = branch.checkpoints.length - 1;

    piEventStream.emit({
      type: 'session_checkpoint',
      id: cp.id,
      label,
    });

    this.notify();
    return cp;
  }

  undo(): SessionCheckpoint | null {
    const branch = this.getActiveBranch();
    if (branch.currentIndex > 0) {
      branch.currentIndex -= 1;
      const target = branch.checkpoints[branch.currentIndex];
      this.notifyRestore(target.snapshot.state);
      this.notify();
      return target;
    }
    return null;
  }

  redo(): SessionCheckpoint | null {
    const branch = this.getActiveBranch();
    if (branch.currentIndex < branch.checkpoints.length - 1) {
      branch.currentIndex += 1;
      const target = branch.checkpoints[branch.currentIndex];
      this.notifyRestore(target.snapshot.state);
      this.notify();
      return target;
    }
    return null;
  }

  canUndo(): boolean {
    const branch = this.getActiveBranch();
    return branch.currentIndex > 0;
  }

  canRedo(): boolean {
    const branch = this.getActiveBranch();
    return branch.currentIndex < branch.checkpoints.length - 1;
  }

  fork(newBranchName: string, options?: ForkOptions): SessionBranch {
    const active = this.getActiveBranch();
    let cutIndex = active.currentIndex;
    let forkPointId: string | undefined = undefined;

    if (options?.fromCheckpointId) {
      const idx = active.checkpoints.findIndex((cp) => cp.id === options.fromCheckpointId);
      if (idx !== -1) {
        cutIndex = idx;
        forkPointId = options.fromCheckpointId;
      }
    } else if (active.currentIndex >= 0 && active.checkpoints[active.currentIndex]) {
      forkPointId = active.checkpoints[active.currentIndex].id;
    }

    const newBranch = this.createBranch(newBranchName, {
      parentBranchId: active.id,
      forkPointId,
      metadata: options?.metadata,
    });

    if (cutIndex >= 0) {
      newBranch.checkpoints = JSON.parse(JSON.stringify(active.checkpoints.slice(0, cutIndex + 1)));
      newBranch.currentIndex = newBranch.checkpoints.length - 1;
    } else {
      newBranch.checkpoints = [];
      newBranch.currentIndex = -1;
    }

    this.activeBranchName = newBranchName;
    this.notify();
    return newBranch;
  }

  getBranchAncestry(branchName: string): SessionBranch[] {
    const ancestry: SessionBranch[] = [];
    let current = this.branches.get(branchName);
    const visited = new Set<string>();

    while (current && !visited.has(current.id)) {
      visited.add(current.id);
      ancestry.unshift(current);
      if (!current.parentBranchId) break;
      current = this.getBranchById(current.parentBranchId);
    }
    return ancestry;
  }

  getBranchTree(): BranchTreeNode[] {
    const all = Array.from(this.branches.values());
    const branchMap = new Map<string, SessionBranch>(all.map((b) => [b.id, b]));

    const buildNode = (branch: SessionBranch): BranchTreeNode => {
      const childrenBranches = all.filter((b) => b.parentBranchId === branch.id);
      return {
        branch,
        children: childrenBranches.map(buildNode),
      };
    };

    const roots = all.filter((b) => !b.parentBranchId || !branchMap.has(b.parentBranchId));
    return roots.map(buildNode);
  }

  diffBranches(baseBranchName: string, targetBranchName: string): BranchDiffResult {
    const baseBranch = this.branches.get(baseBranchName);
    const targetBranch = this.branches.get(targetBranchName);

    if (!baseBranch || !targetBranch) {
      throw new Error(`[SessionBranchManager] Branch not found: ${!baseBranch ? baseBranchName : targetBranchName}`);
    }

    const baseCpIds = new Set(baseBranch.checkpoints.map((c) => c.id));
    let commonAncestorCheckpointId: string | undefined;

    for (let i = targetBranch.checkpoints.length - 1; i >= 0; i--) {
      const cpId = targetBranch.checkpoints[i].id;
      if (baseCpIds.has(cpId)) {
        commonAncestorCheckpointId = cpId;
        break;
      }
    }

    let baseOnlyCheckpoints: SessionCheckpoint[] = [];
    let targetOnlyCheckpoints: SessionCheckpoint[] = [];

    if (commonAncestorCheckpointId) {
      const baseIdx = baseBranch.checkpoints.findIndex((c) => c.id === commonAncestorCheckpointId);
      const targetIdx = targetBranch.checkpoints.findIndex((c) => c.id === commonAncestorCheckpointId);
      baseOnlyCheckpoints = baseBranch.checkpoints.slice(baseIdx + 1);
      targetOnlyCheckpoints = targetBranch.checkpoints.slice(targetIdx + 1);
    } else {
      baseOnlyCheckpoints = [...baseBranch.checkpoints];
      targetOnlyCheckpoints = [...targetBranch.checkpoints];
    }

    const baseState =
      baseBranch.currentIndex >= 0 && baseBranch.checkpoints[baseBranch.currentIndex]
        ? baseBranch.checkpoints[baseBranch.currentIndex].snapshot.state
        : {};
    const targetState =
      targetBranch.currentIndex >= 0 && targetBranch.checkpoints[targetBranch.currentIndex]
        ? targetBranch.checkpoints[targetBranch.currentIndex].snapshot.state
        : {};

    const allKeys = Array.from(new Set([...Object.keys(baseState), ...Object.keys(targetState)]));
    const changedKeys = allKeys.filter(
      (k) => JSON.stringify(baseState[k]) !== JSON.stringify(targetState[k])
    );

    return {
      baseBranch: baseBranchName,
      targetBranch: targetBranchName,
      commonAncestorCheckpointId,
      baseOnlyCheckpoints,
      targetOnlyCheckpoints,
      stateDiffSummary: {
        changedKeys,
        baseState,
        targetState,
      },
    };
  }

  mergeBranch(
    sourceBranchName: string,
    targetBranchName?: string,
    strategy: 'fast-forward' | 'squash' = 'squash'
  ): SessionCheckpoint | null {
    const targetName = targetBranchName ?? this.activeBranchName;
    const source = this.branches.get(sourceBranchName);
    const target = this.branches.get(targetName);

    if (!source || !target) {
      throw new Error(`[SessionBranchManager] Cannot merge: invalid branch (${sourceBranchName} -> ${targetName})`);
    }

    if (source.checkpoints.length === 0) return null;

    const diff = this.diffBranches(targetName, sourceBranchName);
    if (diff.targetOnlyCheckpoints.length === 0) {
      return null;
    }

    const latestSourceCp =
      source.checkpoints[source.currentIndex >= 0 ? source.currentIndex : source.checkpoints.length - 1];

    if (strategy === 'fast-forward') {
      for (const cp of diff.targetOnlyCheckpoints) {
        target.checkpoints.push(JSON.parse(JSON.stringify(cp)));
      }
      target.currentIndex = target.checkpoints.length - 1;
      const latestMerged = target.checkpoints[target.currentIndex];
      if (this.activeBranchName === targetName) {
        this.notifyRestore(latestMerged.snapshot.state);
      }
      this.notify();
      return latestMerged;
    } else {
      const baseState =
        target.currentIndex >= 0 && target.checkpoints[target.currentIndex]
          ? target.checkpoints[target.currentIndex].snapshot.state
          : {};
      const mergedState = {
        ...baseState,
        ...latestSourceCp.snapshot.state,
      };

      const wasActive = this.activeBranchName === targetName;
      if (!wasActive) {
        this.activeBranchName = targetName;
      }
      const cp = this.checkpoint(
        `Merge branch '${sourceBranchName}' into '${targetName}'`,
        mergedState,
        latestSourceCp.snapshot.route
      );
      if (!wasActive) {
        this.activeBranchName = targetName;
      }
      return cp;
    }
  }

  deleteBranch(branchName: string): boolean {
    if (branchName === 'main' || branchName === this.activeBranchName) {
      return false;
    }
    const deleted = this.branches.delete(branchName);
    if (deleted) {
      this.notify();
    }
    return deleted;
  }

  renameBranch(oldName: string, newName: string): boolean {
    if (!this.branches.has(oldName) || this.branches.has(newName)) {
      return false;
    }
    const branch = this.branches.get(oldName)!;
    branch.name = newName;
    this.branches.delete(oldName);
    this.branches.set(newName, branch);
    if (this.activeBranchName === oldName) {
      this.activeBranchName = newName;
    }
    this.notify();
    return true;
  }

  switchBranch(branchName: string): boolean {
    if (this.branches.has(branchName)) {
      this.activeBranchName = branchName;
      const branch = this.getActiveBranch();
      if (branch.currentIndex >= 0 && branch.checkpoints[branch.currentIndex]) {
        this.notifyRestore(branch.checkpoints[branch.currentIndex].snapshot.state);
      }
      this.notify();
      return true;
    }
    return false;
  }

  getAllBranches(): SessionBranch[] {
    return Array.from(this.branches.values());
  }

  reset(): void {
    this.branches.clear();
    this.createBranch('main');
    this.activeBranchName = 'main';
    this.notify();
  }

  restoreState(state: Record<string, any>): void {
    this.notifyRestore(state);
  }

  private notifyRestore(state: Record<string, any>): void {
    this.restoreHandlers.forEach((handler) => {
      try {
        handler(state);
      } catch (err) {
        console.error('[SessionBranchManager] Restore handler hatası:', err);
      }
    });
  }
}

export const sessionManager = new SessionBranchManager();
