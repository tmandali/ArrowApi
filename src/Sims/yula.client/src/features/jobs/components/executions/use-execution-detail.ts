"use client";

import * as React from "react";
import { fetchJobEventLog, fetchJobRequest } from "@/features/jobs/arrow-job-client";
import {
  buildRunEventsFromLog,
  type RunEventItem,
} from "@/features/jobs/run-events";
import { opfsReportCache, type OpfsJobParquetDetail } from "@/services/opfs/opfs-cache";
import type { ArrowJobStatus } from "../../types";
import { prettyJson, sameJobId } from "./execution-helpers";

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
  const opfsLoading = Boolean(selectedId && opfsLoadedId !== selectedId);

  const bumpDetail = React.useCallback(() => {
    setDetailRefreshToken((prev) => prev + 1);
  }, []);

  React.useEffect(() => {
    const abort = new AbortController();

    const loadDetail = async () => {
      if (!selectedId) return;
      setDetailLoading(true);

      const isActive = sameJobId(selectedId, activeJobId);
      if (isActive && activeRequestJson?.trim()) {
        setInputJson(activeRequestJson);
      }

      try {
        const request = await fetchJobRequest(selectedId, abort.signal);
        if (abort.signal.aborted) return;
        if (request && Object.keys(request).length > 0) {
          setInputJson(prettyJson(request));
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
  }, [selectedId, activeJobId, activeRequestJson, detailRefreshToken]);

  // Seçili işe ait OPFS yerel disk dosyalarını yükle
  React.useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    void (async () => {
      try {
        const detail = await opfsReportCache.getParquetJobDetail(selectedId);
        if (!cancelled) {
          setOpfsDetail(detail);
          setOpfsLoadedId(selectedId);
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
  }, [selectedId, detailRefreshToken, selectedJob?.status]);

  const [syncedOpfsSelectedId, setSyncedOpfsSelectedId] = React.useState(selectedId);
  if (syncedOpfsSelectedId !== selectedId) {
    setSyncedOpfsSelectedId(selectedId);
    setOpfsDetail(null);
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
    }
  }

  React.useEffect(() => {
    if (!selectedId) return;
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
        setHistoryEvents(buildRunEventsFromLog(log));
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
