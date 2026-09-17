"use client";

import * as React from "react";
import { fetchJobEventLog, fetchJobRequest } from "@/features/jobs/arrow-job-client";
import { useTabVisible } from "@/hooks/use-tab-visible";
import {
  buildRunEventsFromLog,
  type RunEventItem,
} from "@/features/jobs/run-events";
import { opfsReportCache, type OpfsJobParquetDetail } from "@/services/opfs/opfs-cache";
import type { ArrowJobStatus } from "../../types";
import { prettyJson, sameJobId } from "./execution-helpers";

/**
 * İş başına detay önbelleği: terminal (Completed/Failed/Cancelled) işlerin
 * request JSON'u, OPFS detayı ve persisted event-log'u immutablardır. Item
 * geçişlerinde bunları senkron enjekte etmek "boş kare" flaşını önler;
 * ilk ziyarette bir kez yüklenir, geri dönüşte anında gösterilir.
 */
type DetailCacheEntry = {
  inputJson: string;
  opfs: OpfsJobParquetDetail | null;
  history: RunEventItem[];
};
const detailCache = new Map<string, DetailCacheEntry>();
const DETAIL_CACHE_MAX = 50;

function detailCacheKey(id: string | null | undefined): string | null {
  if (!id) return null;
  return id.trim().toLowerCase();
}

function readDetailCache(id: string | null): DetailCacheEntry | undefined {
  const key = detailCacheKey(id);
  return key ? detailCache.get(key) : undefined;
}

function hasDetailCache(id: string | null | undefined): boolean {
  const key = detailCacheKey(id);
  return key != null && detailCache.has(key);
}

function dropDetailCache(id: string | null | undefined): void {
  const key = detailCacheKey(id);
  if (key) detailCache.delete(key);
}

function writeDetailCache(
  id: string,
  patch: Partial<DetailCacheEntry>
): void {
  const key = detailCacheKey(id);
  if (!key) return;
  const prev = detailCache.get(key) ?? {
    inputJson: "",
    opfs: null,
    history: [],
  };
  detailCache.set(key, { ...prev, ...patch });
  // Basit LRU: en eski anahtarları at (memory sınırlı kaldırı).
  while (detailCache.size > DETAIL_CACHE_MAX) {
    const oldest = detailCache.keys().next().value;
    if (oldest == null) break;
    detailCache.delete(oldest);
  }
}

/**
 * Seçili işin detayı: request JSON, OPFS disk detayı ve persisted event-log.
 * Canlı akan işlerde SSE tek kaynaktır — history yüklenmez.
 */
export function useExecutionDetail(args: {
  selectedId: string | null;
  selectedJob: ArrowJobStatus | null;
  activeJobId?: string | null;
  activeRequestJson?: string;
  activeRunPhase?: "idle" | "running" | "done" | "cancelled";
  isLiveActive: boolean;
  isTerminal: boolean;
  hasHubEvents: boolean;
}) {
  const {
    selectedId,
    selectedJob,
    activeJobId = null,
    activeRequestJson,
    activeRunPhase = "idle",
    isLiveActive,
    isTerminal,
    hasHubEvents,
  } = args;

  const [inputJson, setInputJson] = React.useState("{\n  \n}");
  const [detailLoading, setDetailLoading] = React.useState(false);
  const [historyEvents, setHistoryEvents] = React.useState<RunEventItem[]>([]);
  const [historyLoading, setHistoryLoading] = React.useState(false);
  const [detailRefreshToken, setDetailRefreshToken] = React.useState(0);
  const [opfsDetail, setOpfsDetail] = React.useState<OpfsJobParquetDetail | null>(null);
  const [opfsLoadedId, setOpfsLoadedId] = React.useState<string | null>(null);
  const tabVisible = useTabVisible();
  const opfsLoading = Boolean(selectedId && opfsLoadedId !== selectedId);

  const bumpDetail = React.useCallback(() => {
    // Manuel yenileme: terminal islerin donuk onbelletini at, taze cekim yap.
    if (selectedId) dropDetailCache(selectedId);
    setDetailRefreshToken((prev) => prev + 1);
  }, [selectedId]);

  React.useEffect(() => {
    const abort = new AbortController();

    const loadDetail = async () => {
      if (!selectedId) return;
      // Terminal isin request JSON'u degismez (immutable) — onbelletteyse
      // refetch etme; "loading_request" baslik flaşı yeniden yasamaz.
      if (isTerminal && readDetailCache(selectedId)?.inputJson) {
        setDetailLoading(false);
        return;
      }
      setDetailLoading(true);

      const isActive = sameJobId(selectedId, activeJobId);
      if (isActive && activeRequestJson?.trim()) {
        setInputJson(activeRequestJson);
      }

      try {
        const request = await fetchJobRequest(selectedId, abort.signal);
        if (abort.signal.aborted) return;
        if (request && Object.keys(request).length > 0) {
          const pretty = prettyJson(request);
          setInputJson(pretty);
          if (isTerminal) writeDetailCache(selectedId, { inputJson: pretty });
        } else if (isActive && activeRequestJson?.trim()) {
          setInputJson(activeRequestJson);
        } else {
          setInputJson(prettyJson(request ?? {}));
        }
      } catch {
        if (abort.signal.aborted) return;
        if (isActive && activeRequestJson?.trim()) {
          setInputJson(activeRequestJson);
        } else {
          setInputJson("{\n  \n}");
        }
      } finally {
        if (!abort.signal.aborted) setDetailLoading(false);
      }
    };

    void loadDetail();
    return () => abort.abort();
  }, [selectedId, activeJobId, activeRequestJson, detailRefreshToken, isTerminal]);

  // Seçili işe ait OPFS yerel disk dosyalarını yükle
  React.useEffect(() => {
    if (!selectedId) return;
    // Render-time senkronu terminal is icin OPFS'i onbelletten doldurduysa
    // refetch gereksiz.
    if (isTerminal && hasDetailCache(selectedId)) return;
    let cancelled = false;
    void (async () => {
      try {
        const detail = await opfsReportCache.getParquetJobDetail(selectedId);
        if (!cancelled) {
          setOpfsDetail(detail);
          setOpfsLoadedId(selectedId);
          if (isTerminal) writeDetailCache(selectedId, { opfs: detail });
        }
      } catch {
        if (!cancelled) {
          setOpfsDetail(null);
          setOpfsLoadedId(selectedId);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedId, detailRefreshToken, selectedJob?.status, isTerminal]);

  const [syncedOpfsSelectedId, setSyncedOpfsSelectedId] = React.useState(selectedId);
  if (syncedOpfsSelectedId !== selectedId) {
    setSyncedOpfsSelectedId(selectedId);
    // Terminal işler için önbellekten senkron hidratasyon → "scanning" flaşı yok.
    const cached = isTerminal ? readDetailCache(selectedId) : undefined;
    setOpfsDetail(cached?.opfs ?? null);
    if (cached) setOpfsLoadedId(selectedId);
  }

  // İstek JSON'u: terminal işte cache'te varken senkron göster →
  // önceki işin JSON'u geçici gösterilmez, yeni işin kaydedilişi anında gelir.
  const [syncedInputJobId, setSyncedInputJobId] = React.useState<string | null>(selectedId);
  if (syncedInputJobId !== selectedId) {
    setSyncedInputJobId(selectedId);
    const cached = isTerminal ? readDetailCache(selectedId) : undefined;
    if (cached?.inputJson) setInputJson(cached.inputJson);
  }

  // Load persisted progress for the selected run (skip while watching live active job).
  // Aktif çalışan run için canlı SSE akışı tek güven kaynağıdır; geçmiş yüklenmez.
  const historyResetKey = `${selectedId ?? ""}|${activeJobId ?? ""}|${activeRunPhase ?? ""}`;
  const [syncedHistoryResetKey, setSyncedHistoryResetKey] =
    React.useState(historyResetKey);
  if (syncedHistoryResetKey !== historyResetKey) {
    setSyncedHistoryResetKey(historyResetKey);
    const shouldClearHistory = !selectedId || isLiveActive;
    if (shouldClearHistory) {
      setHistoryEvents([]);
    } else {
      // Geçişte boş kare olmasın: önceki ziyarette kaydediliş varsa onu
      // göster, yoksa mevcut (stale) içerik yeni log'a dek korunur.
      const cached = readDetailCache(selectedId);
      setHistoryEvents(cached?.history ?? historyEvents);
    }
  }

  React.useEffect(() => {
    if (!selectedId) return;
    // Sekme hidden iken arka plan poll'ü yapma; visible'a geçişte
    // effect yeniden çalışıp catch-up loadHistory yapar.
    if (!tabVisible) return;
    // Canlı aktif SSE akışı varsa HTTP ile polling yapma
    if (isLiveActive) return;
    // Terminal bir işse ve sunucunun persisted event-log'u zaten çekildiyse tekrarlama
    if (isTerminal && historyEvents.length > 0) return;
    // Devam eden olmayan ama henüz history çekilmemişse ya da hub event'i yoksa yükle
    if (!isTerminal && hasHubEvents) return;

    const abort = new AbortController();
    let timer: ReturnType<typeof setInterval> | null = null;
    const loadHistory = async () => {
      setHistoryLoading(true);
      try {
        const log = await fetchJobEventLog(selectedId, abort.signal);
        if (abort.signal.aborted) return;
        const events = buildRunEventsFromLog(log);
        setHistoryEvents(events);
        if (isTerminal) writeDetailCache(selectedId, { history: events });
      } catch {
        if (abort.signal.aborted) return;
        setHistoryEvents([]);
      } finally {
        if (!abort.signal.aborted) setHistoryLoading(false);
      }
    };

    void loadHistory();

    // Sadece aktif olmayan ama listede hala "Running/Queued" görünen geçmiş bir iş seçilmişse event-log ile takip et.
    const isOtherRunning =
      !isLiveActive &&
      (selectedJob?.status === "Running" || selectedJob?.status === "Queued");
    if (isOtherRunning) {
      timer = setInterval(() => {
        void loadHistory();
      }, 3000);
    }

    return () => {
      if (timer !== null) clearInterval(timer);
      abort.abort();
    };
  }, [
    selectedId,
    tabVisible,
    isLiveActive,
    isTerminal,
    hasHubEvents,
    historyEvents.length,
    selectedJob?.status,
    detailRefreshToken,
  ]);

  return {
    inputJson,
    setInputJson,
    detailLoading,
    historyEvents,
    setHistoryEvents,
    historyLoading,
    opfsDetail,
    setOpfsDetail,
    opfsLoading,
    bumpDetail,
  };
}
