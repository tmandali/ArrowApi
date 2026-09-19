import { SessionCheckpoint, SessionBranch, AgentEvent } from './types';
import { sessionManager } from './session-branch';
import { piEventStream } from './pi-event-stream';
import { telemetryTracker, TelemetrySummary } from './telemetry-metrics';
import { agentMemory, MemoryEntry } from './memory';

export interface SessionDump {
  version: '1.0';
  exportedAt: number;
  sessionId: string;
  messages: any[];
  checkpoints: SessionCheckpoint[];
  branches: SessionBranch[];
  events: AgentEvent[];
  telemetrySummary: TelemetrySummary;
  memory: MemoryEntry[];
  uiState?: Record<string, any>;
}

/**
 * Pi-Style Agent Session Harness
 * Reference: earendil-works/pi/packages/agent/src/harness/session/
 * 
 * Sorumluluklar:
 * 1. Dump Alma (Export): Tüm oturumu (mesajlar, dallar, telemetri, bellek) JSON'a aktarma
 * 2. Geri Yükleme (Restore/Import): Dışarıdan veya saklanan JSON'dan oturumu ayağa kaldırma
 * 3. Yeni Konuşma Başlatma (New Conversation / Reset): Sıfır maliyetle temiz bir oturum başlatma
 */
export class SessionHarness {
  private currentSessionId: string = `session_${Date.now()}`;
  private onResetListeners: Set<() => void> = new Set();
  private onRestoreListeners: Set<(dump: SessionDump) => void> = new Set();

  constructor() {
    this.currentSessionId = `session_${Date.now()}`;
  }

  getSessionId(): string {
    return this.currentSessionId;
  }

  onReset(listener: () => void): () => void {
    this.onResetListeners.add(listener);
    return () => this.onResetListeners.delete(listener);
  }

  onRestore(listener: (dump: SessionDump) => void): () => void {
    this.onRestoreListeners.add(listener);
    return () => this.onRestoreListeners.delete(listener);
  }

  /**
   * Mevcut oturumun eksiksiz bir anlık görüntüsünü (Dump) üretir.
   */
  dumpSession(currentMessages: any[] = [], currentUiState?: Record<string, any>): SessionDump {
    const activeBranch = sessionManager.getActiveBranch();
    const dump: SessionDump = {
      version: '1.0',
      exportedAt: Date.now(),
      sessionId: this.currentSessionId,
      messages: JSON.parse(JSON.stringify(currentMessages)),
      checkpoints: JSON.parse(JSON.stringify(activeBranch.checkpoints)),
      branches: JSON.parse(JSON.stringify(sessionManager.getAllBranches())),
      events: JSON.parse(JSON.stringify(piEventStream.getHistory())),
      telemetrySummary: telemetryTracker.getMetricsSummary(),
      memory: agentMemory.getAll(),
      uiState: currentUiState ? JSON.parse(JSON.stringify(currentUiState)) : undefined,
    };
    return dump;
  }

  /**
   * Oturumu tarayıcıda bir .json dosyası olarak kullanıcının bilgisayarına indirir.
   */
  exportSessionToFile(dump: SessionDump, filename?: string): void {
    if (typeof window === 'undefined') return;

    const name = filename || `agent_session_${this.currentSessionId}_${new Date().toISOString().slice(0, 10)}.json`;
    const jsonStr = JSON.stringify(dump, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /**
   * JSON metninden veya objesinden bir oturum dump'ını geri yükler.
   */
  restoreSession(dumpOrJson: string | SessionDump): { success: boolean; dump?: SessionDump; error?: string } {
    try {
      const dump: SessionDump = typeof dumpOrJson === 'string' ? JSON.parse(dumpOrJson) : dumpOrJson;

      if (!dump || dump.version !== '1.0' || !Array.isArray(dump.messages)) {
        return { success: false, error: 'Geçersiz oturum dump formatı (version 1.0 bekleniyor).' };
      }

      this.currentSessionId = dump.sessionId || `session_${Date.now()}`;

      // 1. Olay akışını geri yükle
      piEventStream.clearHistory();
      if (Array.isArray(dump.events)) {
        dump.events.forEach((ev) => piEventStream.emit(ev));
      }

      // 2. Belleği geri yükle
      if (Array.isArray(dump.memory)) {
        dump.memory.forEach((m) => {
          agentMemory.remember(m.key, m.value, m.scope, m.description);
        });
      }

      // 3. Checkpoint'leri ve UI durumunu geri yükle
      if (dump.uiState) {
        // En son kaydedilmiş UI durumunu tetikle
        sessionManager.restoreState(dump.uiState);
      } else if (dump.checkpoints && dump.checkpoints.length > 0) {
        const lastCp = dump.checkpoints[dump.checkpoints.length - 1];
        if (lastCp?.snapshot?.state) {
          sessionManager.restoreState(lastCp.snapshot.state);
        }
      }

      // Dinleyicileri bilgilendir (React useChat state'ini güncelleyebilsin)
      this.onRestoreListeners.forEach((l) => l(dump));

      return { success: true, dump };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Bilinmeyen geri yükleme hatası' };
    }
  }

  /**
   * Yeni bir konuşma başlatır (Tüm geçmişi, session hafızasını ve telemetriyi sıfırlar).
   */
  newConversation(): void {
    this.currentSessionId = `session_${Date.now()}`;
    piEventStream.clearHistory();
    telemetryTracker.reset();
    agentMemory.clear('session');

    // UI'daki chat state ve dinleyicileri sıfırla
    this.onResetListeners.forEach((l) => l());
  }
}

export const sessionHarness = new SessionHarness();
