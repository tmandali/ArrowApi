import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface RecordComment {
  id: string;
  text: string;
  createdAt: number;
}

/** Kayıt başına üst sınır (localStorage şişmesin) */
const COMMENTS_PER_RECORD_MAX = 50;

function makeId() {
  return `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

interface RecordCommentsState {
  byRecord: Record<string, RecordComment[]>;
  addComment: (recordKey: string, text: string) => void;
  removeComment: (recordKey: string, id: string) => void;
}

/**
 * Detay zaman çizgisi yorumları — kayıt anahtarıyla (`agent:<id>`,
 * `skill:<id>`…) cihazda saklanır. Deterministik sıralama (eklenme sırası);
 * zaman damgası UTC tarih olarak basılır.
 */
export const useRecordCommentsStore = create<RecordCommentsState>()(
  persist(
    (set) => ({
      byRecord: {},
      addComment: (recordKey, text) => {
        const clean = text.trim();
        if (!clean) return;
        set((s) => {
          const prev = s.byRecord[recordKey] ?? [];
          const next = [
            ...prev,
            { id: makeId(), text: clean, createdAt: Date.now() },
          ].slice(-COMMENTS_PER_RECORD_MAX);
          return { byRecord: { ...s.byRecord, [recordKey]: next } };
        });
      },
      removeComment: (recordKey, id) =>
        set((s) => {
          const prev = s.byRecord[recordKey] ?? [];
          return {
            byRecord: {
              ...s.byRecord,
              [recordKey]: prev.filter((c) => c.id !== id),
            },
          };
        }),
    }),
    { name: "yula-record-comments" },
  ),
);
