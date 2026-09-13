"use client";

import * as React from "react";
import {
  arrowJobEventHub,
  type JobHubSnapshot,
} from "@/features/jobs/services/arrow-job-event-hub";
import type { ArrowJobStatus } from "../../types";
import type { RunEventItem } from "@/features/jobs/run-events";
import { displayStatusFor, sameJobId } from "./execution-helpers";
import type { PendingJobInfo } from "./use-executions-list";

/**
 * Seçili iş için EventHub snapshot'ı, canlı abonelik ve türetilmiş durumlar
 * (canlı faz, görünen statü, terminal kontrolü, canlı sayaçlar).
 */
export function useExecutionHub(args: {
  selectedId: string | null;
  selectedJob: ArrowJobStatus | null;
  activeJobId?: string | null;
  activeLiveStatus?: string;
  activeRunPhase?: "idle" | "running" | "done" | "cancelled";
  activeRunEvents?: RunEventItem[];
  jobName?: string;
  pendingJobs?: PendingJobInfo[];
}) {
  const {
    selectedId,
    selectedJob,
    activeJobId = null,
    activeLiveStatus,
    activeRunPhase = "idle",
    activeRunEvents = [],
    jobName = "report",
    pendingJobs = [],
  } = args;

  const isActiveSelected = sameJobId(selectedId, activeJobId);

  const [hubSnapshot, setHubSnapshot] = React.useState<JobHubSnapshot | null>(
    () => (selectedId ? arrowJobEventHub.getSnapshot(selectedId) ?? null : null)
  );

  const [syncedSelectedId, setSyncedSelectedId] = React.useState(selectedId);
  if (syncedSelectedId !== selectedId) {
    setSyncedSelectedId(selectedId);
    setHubSnapshot(selectedId ? arrowJobEventHub.getSnapshot(selectedId) ?? null : null);
  }

  React.useEffect(() => {
    if (!selectedId) return;

    const isJobInFlight =
      selectedJob?.status === "Running" ||
      selectedJob?.status === "Queued" ||
      (isActiveSelected && activeRunPhase === "running");

    if (isJobInFlight && !arrowJobEventHub.isStreaming(selectedId)) {
      arrowJobEventHub.startStream({
        id: selectedId,
        status: selectedJob?.status || activeLiveStatus || "Running",
        name: selectedJob?.name || jobName,
        eventsUrl: selectedJob?.eventsUrl,
        jobUrl: selectedJob?.jobUrl,
        createdAt: selectedJob?.createdAt,
      });
    }

    const unsub = arrowJobEventHub.subscribe(
      selectedId,
      (detail) => {
        setHubSnapshot({ ...detail.snapshot });
      },
      { replay: true }
    );

    return unsub;
  }, [
    selectedId,
    selectedJob?.status,
    selectedJob?.name,
    selectedJob?.eventsUrl,
    selectedJob?.jobUrl,
    selectedJob?.createdAt,
    jobName,
    isActiveSelected,
    activeLiveStatus,
    activeRunPhase,
  ]);

  const hubEvents = hubSnapshot?.events ?? [];
  const hasHubEvents = hubEvents.length > 0;

  const isRunningPhase =
    hubSnapshot?.phase === "running" ||
    (isActiveSelected && activeRunPhase === "running") ||
    selectedJob?.status === "Running" ||
    selectedJob?.status === "Queued";

  const isLiveActive =
    isRunningPhase ||
    Boolean(hubSnapshot?.isStreaming) ||
    (isActiveSelected && activeRunPhase === "running");

  const pendingSelectedStatus = pendingJobs.find((p) =>
    sameJobId(p.id, selectedId)
  )?.status;
  const selectedDisplayStatus =
    hubSnapshot?.status ||
    (isActiveSelected && activeLiveStatus) ||
    pendingSelectedStatus ||
    displayStatusFor(selectedJob, activeJobId, undefined);

  const normStatus = (selectedDisplayStatus || "").trim().toLowerCase();
  const isTerminal =
    normStatus === "completed" ||
    normStatus === "cancelled" ||
    normStatus === "canceled" ||
    normStatus === "failed";

  // Live row/batch counts for the currently selected job (when running in EventHub).
  const liveCounts = React.useMemo(() => {
    if (!selectedId) return null;
    if (hubSnapshot?.totalRows != null || hubSnapshot?.batchCount != null) {
      return {
        totalRows: hubSnapshot.totalRows ?? null,
        batchCount: hubSnapshot.batchCount ?? null,
      };
    }
    const sourceEvents =
      hubSnapshot?.events?.length
        ? hubSnapshot.events
        : isActiveSelected && activeRunEvents.length > 0
          ? activeRunEvents
          : [];
    let totalRows: number | null = null;
    let batchCount: number | null = null;
    for (const event of sourceEvents) {
      if (typeof event.totalRows === "number") totalRows = event.totalRows;
      if (typeof event.batchCount === "number") batchCount = event.batchCount;
    }
    return totalRows == null && batchCount == null
      ? null
      : { totalRows, batchCount };
  }, [selectedId, hubSnapshot, isActiveSelected, activeRunEvents]);

  return {
    hubSnapshot,
    hubEvents,
    hasHubEvents,
    isActiveSelected,
    isRunningPhase,
    isLiveActive,
    selectedDisplayStatus,
    normStatus,
    isTerminal,
    liveCounts,
  };
}
