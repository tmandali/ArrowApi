import { piEventStream } from '../telemetry/pi-event-stream';
import { sessionJournal, JournalEntry } from '../session/session-replay';

export interface ReconciliationResult {
  recoveredCount: number;
  hasInconsistencies: boolean;
  message: string;
  details: string[];
}

export class ReconciliationEngine {
  /**
   * Oturum açılışında veya beklenmeyen kopmalarda oturum günlüğünü denetler.
   * Tamamlanmamış veya havada kalmış eylemleri tespit edip temizler.
   */
  reconcile(): ReconciliationResult {
    const entries = sessionJournal.getEntries();
    const details: string[] = [];
    let recoveredCount = 0;

    // 1. Eşleşmeyen tool execution olaylarını kontrol et
    const activeToolCalls = new Set<string>();

    for (const entry of entries) {
      if (entry.type === 'tool_execution') {
        const { status, toolCallId } = entry.payload || {};
        if (status === 'started' && toolCallId) {
          activeToolCalls.add(toolCallId);
        } else if ((status === 'completed' || status === 'error' || status === 'reconciled_rollback') && toolCallId) {
          activeToolCalls.delete(toolCallId);
        }
      }
    }

    if (activeToolCalls.size > 0) {
      activeToolCalls.forEach((id) => {
        recoveredCount++;
        details.push(`Askıda kalan araç çağrısı mühürlendi/kurtarıldı: ${id}`);
        sessionJournal.append('tool_execution', {
          toolCallId: id,
          status: 'reconciled_rollback',
          reason: 'Oturum yeniden başlatıldı veya kilitlenme sonrası kurtarıldı.',
        });
      });
    }

    const hasInconsistencies = recoveredCount > 0;
    const message = hasInconsistencies
      ? `${recoveredCount} adet tutarsız/askıda işlem tespit edildi ve oturum kararlı duruma getirildi.`
      : 'Oturum durumu tamamen tutarlı ve kararlı.';

    piEventStream.emit({
      type: 'reconcile_completed',
      recoveredCount,
      message,
      timestamp: Date.now(),
    });

    return {
      recoveredCount,
      hasInconsistencies,
      message,
      details,
    };
  }

  /**
   * Kasti bir kilitlenme/tutarsızlık simülasyonu ekler (Test amaçlı).
   */
  simulateCrashOrphan(toolCallId: string, toolName: string): void {
    sessionJournal.append('tool_execution', {
      toolCallId,
      toolName,
      status: 'started',
      timestamp: Date.now(),
    });
  }
}

export const reconciliationEngine = new ReconciliationEngine();
