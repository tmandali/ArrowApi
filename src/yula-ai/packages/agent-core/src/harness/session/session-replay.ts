import { piEventStream } from '../telemetry/pi-event-stream';
import { uiEventBus } from '../ui-bridge/event-bus';
import { UIAction, UIEvent } from '../../types';

export type JournalEntryType = 
  | 'ui_action' 
  | 'ui_event' 
  | 'tool_execution' 
  | 'state_snapshot' 
  | 'route_change';

export interface JournalEntry {
  seq: number;
  timestamp: number;
  type: JournalEntryType;
  payload: any;
  meta?: Record<string, any>;
}

export class SessionJournal {
  private entries: JournalEntry[] = [];
  private sequenceCounter: number = 0;
  private storageKey: string = 'pi_agent_journal_v1';

  constructor() {
    this.initAutoRecording();
  }

  private initAutoRecording(): void {
    // Event bus üzerinden gelen olayları ve aksiyonları otomatik kaydet
    // Not: Sonsuz döngüyü engellemek için replay esnasında kayıt duraklatılabilir.
  }

  append(type: JournalEntryType, payload: any, meta?: Record<string, any>): JournalEntry {
    this.sequenceCounter += 1;
    const entry: JournalEntry = {
      seq: this.sequenceCounter,
      timestamp: Date.now(),
      type,
      payload: JSON.parse(JSON.stringify(payload)), // Deep clone
      meta,
    };
    this.entries.push(entry);
    return entry;
  }

  getEntries(): JournalEntry[] {
    return [...this.entries];
  }

  getEntryCount(): number {
    return this.entries.length;
  }

  getEntryBySeq(seq: number): JournalEntry | undefined {
    return this.entries.find((e) => e.seq === seq);
  }

  exportJSONL(): string {
    return this.entries.map((e) => JSON.stringify(e)).join('\n');
  }

  importJSONL(jsonlContent: string): void {
    const lines = jsonlContent.split('\n').filter((l) => l.trim().length > 0);
    const parsed: JournalEntry[] = [];
    let maxSeq = 0;

    for (const line of lines) {
      try {
        const item = JSON.parse(line) as JournalEntry;
        parsed.push(item);
        if (item.seq > maxSeq) maxSeq = item.seq;
      } catch (err) {
        console.warn('[SessionJournal] JSONL satırı çözümlenemedi:', line);
      }
    }

    this.entries = parsed;
    this.sequenceCounter = maxSeq;
  }

  /**
   * Belirtilen sequence numarasına kadar olan eylemleri adım adım tekrar yürütür.
   */
  async replayTo(
    targetSeq: number,
    onStep?: (entry: JournalEntry, index: number, total: number) => void
  ): Promise<{ executedCount: number }> {
    const targetEntries = this.entries.filter((e) => e.seq <= targetSeq);
    piEventStream.emit({
      type: 'session_replayed',
      fromSeq: 1,
      toSeq: targetSeq,
      timestamp: Date.now(),
    });

    let executedCount = 0;
    for (let i = 0; i < targetEntries.length; i++) {
      const entry = targetEntries[i];
      if (onStep) {
        onStep(entry, i + 1, targetEntries.length);
      }

      // UI aksiyonu ise event bus ile yeniden tetikle
      if (entry.type === 'ui_action') {
        const action = entry.payload as UIAction;
        uiEventBus.dispatch(action);
      }

      executedCount++;
      // Küçük bir mikro-gecikme ile UI geçişlerinin işlenmesini sağla
      await new Promise((resolve) => setTimeout(resolve, 25));
    }

    return { executedCount };
  }

  saveToLocalStorage(customKey?: string): void {
    if (typeof window === 'undefined' || !window.localStorage) return;
    const key = customKey || this.storageKey;
    window.localStorage.setItem(key, JSON.stringify(this.entries));
  }

  loadFromLocalStorage(customKey?: string): boolean {
    if (typeof window === 'undefined' || !window.localStorage) return false;
    const key = customKey || this.storageKey;
    const raw = window.localStorage.getItem(key);
    if (!raw) return false;

    try {
      const parsed = JSON.parse(raw) as JournalEntry[];
      this.entries = parsed;
      this.sequenceCounter = parsed.reduce((max, e) => Math.max(max, e.seq), 0);
      return true;
    } catch (err) {
      console.error('[SessionJournal] LocalStorage yükleme hatası:', err);
      return false;
    }
  }

  clear(): void {
    this.entries = [];
    this.sequenceCounter = 0;
  }
}

export const sessionJournal = new SessionJournal();
