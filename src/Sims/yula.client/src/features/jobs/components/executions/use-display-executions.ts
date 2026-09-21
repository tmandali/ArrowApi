import * as React from "react";
import { isTerminalJobStatus } from "@/store/slices/active-jobs-store";
import { arrowJobEventHub } from "@/features/jobs/services/arrow-job-event-hub";
import type { ArrowJobStatus } from "../../types";
import { sameJobId } from "./execution-helpers";
import type { PendingJobItem } from "./arrow-job-executions-types";

export interface UseDisplayExecutionsOptions {
  items: ArrowJobStatus[];
  pendingJobs?: PendingJobItem[];
  activeJobId?: string | null;
  activeLiveStatus?: string;
  jobName: string;
  hubSnapshot?: { status?: string; totalRows?: number | null; batchCount?: number | null } | null;
  selectedId: string | null;
}

/**
 * Computes the unified execution items list by patching live status
 * and merging extra in-flight queued jobs into the authoritative DB list.
 */
export function useDisplayExecutions({
  items,
  pendingJobs = [],
  activeJobId,
  activeLiveStatus,
  jobName,
  hubSnapshot,
  selectedId,
}: UseDisplayExecutionsOptions): ArrowJobStatus[] {
  return React.useMemo(() => {
    const next = items.map((job) => {
      // Bitmiş işler için sunucu veritabanındaki değerler korunur
      if (isTerminalJobStatus(job.status)) {
        return job;
      }

      // Devam eden iş için canlı EventHub snapshot'ı veya pendingJobs'tan anlık sayaçları al
      const liveSnap = sameJobId(job.id, selectedId)
        ? hubSnapshot
        : arrowJobEventHub.getSnapshot(job.id);
      const pending = pendingJobs.find((p) => sameJobId(p.id, job.id));

      const liveStatus =
        liveSnap?.status ||
        pending?.status ||
        (sameJobId(job.id, activeJobId) ? activeLiveStatus : null) ||
        job.status;

      const liveTotalRows =
        liveSnap?.totalRows ?? pending?.totalRows ?? job.totalRows;
      const liveBatchCount =
        liveSnap?.batchCount ?? pending?.batchCount ?? job.batchCount;

      return {
        ...job,
        status: liveStatus,
        totalRows: liveTotalRows ?? undefined,
        batchCount: liveBatchCount ?? undefined,
      };
    });

    // API listesine henüz girmemiş yeni başlatılan bekleyen işler
    const extras: ArrowJobStatus[] = [];
    for (const pending of pendingJobs) {
      if (next.some((job) => sameJobId(job.id, pending.id))) continue;
      const snap = sameJobId(pending.id, selectedId)
        ? hubSnapshot
        : arrowJobEventHub.getSnapshot(pending.id);
      extras.push({
        id: pending.id,
        status: snap?.status || pending.status || "Queued",
        name: pending.name || jobName,
        jobUrl: "",
        eventsUrl: "",
        createdAt: pending.createdAt || new Date().toISOString(),
        totalRows: snap?.totalRows ?? pending.totalRows ?? undefined,
        batchCount: snap?.batchCount ?? pending.batchCount ?? undefined,
      });
    }

    if (
      activeJobId &&
      !next.some((job) => sameJobId(job.id, activeJobId)) &&
      !extras.some((job) => sameJobId(job.id, activeJobId))
    ) {
      const activeSnap = sameJobId(activeJobId, selectedId)
        ? hubSnapshot
        : arrowJobEventHub.getSnapshot(activeJobId);
      extras.unshift({
        id: activeJobId,
        status: activeLiveStatus || activeSnap?.status || "Queued",
        name: jobName,
        jobUrl: "",
        eventsUrl: "",
        createdAt: new Date().toISOString(),
        totalRows: activeSnap?.totalRows ?? undefined,
        batchCount: activeSnap?.batchCount ?? undefined,
      });
    }

    return extras.length > 0 ? [...extras, ...next] : next;
  }, [items, pendingJobs, activeJobId, activeLiveStatus, jobName, hubSnapshot, selectedId]);
}
