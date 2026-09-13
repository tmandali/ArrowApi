"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { listArrowJobs } from "@/features/jobs/arrow-job-client";
import type { ArrowJobStatus } from "../../types";

export type PendingJobInfo = {
  id: string;
  status?: string;
  createdAt?: string;
  name?: string;
  totalRows?: number | null;
  batchCount?: number | null;
};

/**
 * Executions listesi: yükleme, sessiz yenileme, polling ve run-bitiş tazeleme.
 */
export function useExecutionsList(args: {
  jobsEndpoint: string;
  listRefreshToken?: number;
  activeRunPhase?: "idle" | "running" | "done" | "cancelled";
  pendingJobs?: PendingJobInfo[];
  onListLoaded?: (count: number) => void;
  onListError?: (message: string | null) => void;
}) {
  const {
    jobsEndpoint,
    listRefreshToken = 0,
    activeRunPhase = "idle",
    pendingJobs = [],
    onListLoaded,
    onListError,
  } = args;
  const t = useTranslations("JobExecutions");

  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [items, setItems] = React.useState<ArrowJobStatus[]>([]);
  const [total, setTotal] = React.useState(0);
  const [refreshing, setRefreshing] = React.useState(false);

  const onListLoadedRef = React.useRef(onListLoaded);
  const onListErrorRef = React.useRef(onListError);

  React.useEffect(() => {
    onListLoadedRef.current = onListLoaded;
    onListErrorRef.current = onListError;
  }, [onListLoaded, onListError]);

  const loadList = React.useCallback(
    async (signal?: AbortSignal, options?: { silent?: boolean }) => {
      if (!options?.silent) {
        setLoading(true);
        setError(null);
      }
      try {
        const page = await listArrowJobs(jobsEndpoint, {
          take: 50,
          signal,
        });
        setItems(page.items ?? []);
        setTotal(page.total ?? 0);
        setError(null);
        onListLoadedRef.current?.(page.total ?? (page.items?.length ?? 0));
      } catch (err) {
        if (signal?.aborted) return;
        setError(
          err instanceof Error ? err.message : t("job_list_fetch_failed")
        );
        if (!options?.silent) {
          setItems([]);
          setTotal(0);
        }
      } finally {
        if (!signal?.aborted && !options?.silent) setLoading(false);
      }
    },
    [jobsEndpoint, t]
  );

  const handleRefresh = React.useCallback(async () => {
    setRefreshing(true);
    const minSpinPromise = new Promise((resolve) => setTimeout(resolve, 500));
    try {
      await loadList();
      await minSpinPromise;
    } finally {
      setRefreshing(false);
    }
  }, [loadList]);

  React.useEffect(() => {
    onListErrorRef.current?.(error);
  }, [error]);

  React.useEffect(() => {
    const abort = new AbortController();
    const bootstrap = async () => {
      await loadList(abort.signal);
    };
    void bootstrap();
    return () => abort.abort();
  }, [loadList]);

  React.useEffect(() => {
    if (!listRefreshToken) return;
    const refresh = async () => {
      await loadList(undefined, { silent: true });
    };
    void refresh();
  }, [listRefreshToken, loadList]);

  // Poll while any in-flight job exists (focused or queued siblings).
  React.useEffect(() => {
    const hasPending = pendingJobs.some(
      (job) =>
        job.status === "Queued" ||
        job.status === "Running" ||
        !job.status
    );
    if (activeRunPhase !== "running" && !hasPending) return;
    const id = window.setInterval(() => {
      void loadList(undefined, { silent: true });
    }, 2500);
    return () => window.clearInterval(id);
  }, [activeRunPhase, pendingJobs, loadList]);

  const lastRefreshPhaseRef = React.useRef(activeRunPhase);

  // Refresh once when run finishes / cancels.
  React.useEffect(() => {
    const prev = lastRefreshPhaseRef.current;
    lastRefreshPhaseRef.current = activeRunPhase;
    if (
      prev === "running" &&
      (activeRunPhase === "done" || activeRunPhase === "cancelled")
    ) {
      void loadList(undefined, { silent: true });
    }
  }, [activeRunPhase, loadList]);

  return {
    items,
    setItems,
    total,
    loading,
    refreshing,
    error,
    setError,
    loadList,
    handleRefresh,
  };
}
