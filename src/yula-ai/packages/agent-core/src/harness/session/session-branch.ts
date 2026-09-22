import { SessionCheckpoint, SessionBranch } from '../../types';
import { uiEventBus } from '../ui-bridge/event-bus';
import { piEventStream } from '../telemetry/pi-event-stream';

type StateRestoreHandler = (state: Record<string, any>) => void;

/**
 * Pi-Style Session Branching, Checkpointing & Time-Travel (Undo/Redo)
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

  createBranch(name: string): SessionBranch {
    const branch: SessionBranch = {
      id: `branch_${Date.now()}_${name}`,
      name,
      createdAt: Date.now(),
      checkpoints: [],
      currentIndex: -1,
    };
    this.branches.set(name, branch);
    return branch;
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

    // Eğer undo yapılmışsa sonrasını kesip yeni checkpoint ekle
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

  fork(newBranchName: string): SessionBranch {
    const active = this.getActiveBranch();
    const newBranch = this.createBranch(newBranchName);

    // Mevcut daldaki o ana kadarki tüm checkpoint'leri kopyala
    newBranch.checkpoints = JSON.parse(JSON.stringify(active.checkpoints.slice(0, active.currentIndex + 1)));
    newBranch.currentIndex = newBranch.checkpoints.length - 1;
    this.activeBranchName = newBranchName;

    this.notify();
    return newBranch;
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
