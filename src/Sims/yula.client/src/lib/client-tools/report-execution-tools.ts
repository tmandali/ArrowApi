import { resolveCurrentReportScope } from "./job-scope-resolver";

export async function navigateToPageTool(
  args: Record<string, unknown>,
): Promise<unknown> {
  const targetPath = String(args.path ?? "").trim();
  if (!targetPath) {
    return {
      status: "error",
      message: "Target page path was not specified.",
    };
  }
  const currentPath =
    typeof window !== "undefined" ? window.location.pathname : "";
  if (currentPath === targetPath) {
    return {
      status: "already_on_page",
      navigateTo: targetPath,
      message: `Already on ${targetPath}.`,
    };
  }
  const title =
    typeof args.title === "string" ? args.title : targetPath;
  return {
    status: "navigated",
    navigateTo: targetPath,
    message: `Navigating to "${title}".`,
  };
}

export async function openLastReportTool(
  args: Record<string, unknown>,
): Promise<unknown> {
  try {
    const { REGISTERED_REPORTS } = await import(
      "@/features/reports/report-registry"
    );
    let scope = typeof args.report === "string" ? args.report.trim().toLowerCase() : "";
    if (!scope) {
      scope = await resolveCurrentReportScope();
    }
    const matched = scope
      ? REGISTERED_REPORTS.filter(
          (r) =>
            r.scope === scope ||
            r.aliases.some((a) => scope.includes(a) || a.includes(scope)),
        )
      : [];
    const targets = matched.length > 0 ? matched : REGISTERED_REPORTS;

    const { listArrowJobs } = await import("@/features/jobs/arrow-job-client");
    type Candidate = { jobId: string; status: string; createdAt: string; title: string; href: string };
    const candidates: Candidate[] = [];

    for (const report of targets) {
      const endpoint = (report.fullSchema as Record<string, unknown>)["x-job-endpoint"];
      if (typeof endpoint !== "string" || !endpoint) continue;
      try {
        const { items } = await listArrowJobs(endpoint, { take: 10 });
        for (const j of items) {
          candidates.push({
            jobId: j.id,
            status: j.status,
            createdAt: j.createdAt ?? "",
            title: report.title,
            href: `${report.pagePath}/${j.id}`,
          });
        }
      } catch {
        // Tek raporun listesi başarısız olsa da diğerlerine bak
      }
    }

    // Liste API'sine henüz düşmemiş in-flight job'ları da dahil et
    const { useActiveJobsStore } = await import(
      "@/store/slices/active-jobs-store"
    );
    for (const job of Object.values(useActiveJobsStore.getState().jobs)) {
      if (scope && (job.name ?? "").toLowerCase() !== scope) continue;
      if (candidates.some((c) => c.jobId === job.id)) continue;
      // Href'i job'un kendi rapor kaydından çöz; çözülemeyen job'a
      // gidilemez (varsayılan rapor yolu yazılmaz).
      const inFlightScope = (job.name ?? "").toLowerCase();
      const inFlightReport = REGISTERED_REPORTS.find(
        (r) => r.scope === inFlightScope,
      );
      const inFlightHref =
        job.href ??
        (inFlightReport ? `${inFlightReport.pagePath}/${job.id}` : undefined);
      if (!inFlightHref) continue;
      candidates.push({
        jobId: job.id,
        status: job.status,
        createdAt: job.createdAt ?? "",
        title: job.title || job.name,
        href: inFlightHref,
      });
    }

    candidates.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const lastJob = candidates[0];
    if (!lastJob) {
      return {
        status: "not_found",
        message:
          "No report execution found. You may suggest running a new report with run_job.",
      };
    }
    return {
      status: "navigated",
      jobId: lastJob.jobId,
      navigateTo: lastJob.href,
      message: `Opened last report: ${lastJob.title} (job ${lastJob.jobId.slice(0, 8)}, ${lastJob.status}).`,
    };
  } catch (err) {
    return { status: "error", error: err instanceof Error ? err.message : String(err) };
  }
}

export async function listReportExecutionsTool(
  args: Record<string, unknown>,
): Promise<unknown> {
  const scope = await resolveCurrentReportScope(args.report);
  const limit =
    typeof args.limit === "number"
      ? Math.min(10, Math.max(1, args.limit))
      : 10;
  try {
    const { findReport, REGISTERED_REPORTS } = await import("@/features/reports/report-registry");
    const { listArrowJobs } = await import("@/features/jobs/arrow-job-client");
    const { useActiveJobsStore } = await import("@/store/slices/active-jobs-store");

    type ExecutionItem = {
      jobId: string;
      report: string;
      reportTitle: string;
      status: string;
      createdAt: string;
      rowCount?: number;
      href?: string;
    };

    if (scope) {
      const meta = findReport(scope);
      const endpoint =
        typeof meta?.fullSchema?.["x-job-endpoint"] === "string"
          ? (meta.fullSchema["x-job-endpoint"] as string)
          : `/api/arrow/jobs/${scope}`;

      let jobsFromApi: import("@/features/jobs/types").ArrowJobStatus[] = [];
      try {
        const res = await listArrowJobs(endpoint, { take: limit });
        jobsFromApi = res.items || [];
      } catch {
        // Fallback to active store if server endpoint not reachable
      }

      const executions: ExecutionItem[] = jobsFromApi.slice(0, limit).map((j) => ({
        jobId: j.id,
        report: scope,
        reportTitle: meta?.title || scope,
        status: j.status,
        createdAt: j.createdAt ?? "",
        rowCount: j.totalRows,
        href: meta ? `${meta.pagePath}/${j.id}` : undefined,
      }));

      // Include matching in-flight jobs from active store
      for (const job of Object.values(useActiveJobsStore.getState().jobs)) {
        if ((job.name ?? "").toLowerCase() !== scope) continue;
        if (executions.some((e) => e.jobId === job.id)) continue;
        executions.push({
          jobId: job.id,
          report: scope,
          reportTitle: meta?.title || job.title || job.name,
          status: job.status,
          createdAt: job.createdAt ?? "",
          rowCount: undefined,
          href: job.href ?? (meta ? `${meta.pagePath}/${job.id}` : undefined),
        });
      }

      executions.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
      const finalExecutions = executions.slice(0, limit);

      return {
        status: "ok",
        report: scope,
        reportTitle: meta?.title || scope,
        executions: finalExecutions,
        total: finalExecutions.length,
        message: `Listed ${finalExecutions.length} report execution(s) for ${meta?.title || scope}.`,
      };
    }

    // No specific report scope (e.g. general dashboard / root page):
    // List executions across all registered reports + active jobs store
    const allExecutions: ExecutionItem[] = [];

    for (const report of REGISTERED_REPORTS) {
      const endpoint = (report.fullSchema as Record<string, unknown>)["x-job-endpoint"];
      if (typeof endpoint !== "string" || !endpoint) continue;
      try {
        const { items } = await listArrowJobs(endpoint, { take: limit });
        for (const j of items) {
          allExecutions.push({
            jobId: j.id,
            report: report.scope,
            reportTitle: report.title,
            status: j.status,
            createdAt: j.createdAt ?? "",
            rowCount: j.totalRows,
            href: `${report.pagePath}/${j.id}`,
          });
        }
      } catch {
        // Continue if single endpoint fails
      }
    }

    // In-flight jobs from active store
    for (const job of Object.values(useActiveJobsStore.getState().jobs)) {
      if (allExecutions.some((e) => e.jobId === job.id)) continue;
      const inFlightScope = (job.name ?? "").toLowerCase();
      const inFlightReport = REGISTERED_REPORTS.find((r) => r.scope === inFlightScope);
      allExecutions.push({
        jobId: job.id,
        report: inFlightScope,
        reportTitle: job.title || inFlightReport?.title || job.name,
        status: job.status,
        createdAt: job.createdAt ?? "",
        rowCount: undefined,
        href: job.href ?? (inFlightReport ? `${inFlightReport.pagePath}/${job.id}` : undefined),
      });
    }

    allExecutions.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
    const slice = allExecutions.slice(0, limit);
    return {
      status: "ok",
      report: "all",
      executions: slice,
      total: allExecutions.length,
      message: `Listed ${slice.length} past execution(s) across all reports (total: ${allExecutions.length}).`,
    };
  } catch (err) {
    return {
      status: "error",
      executions: [],
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function cancelJobTool(
  args: Record<string, unknown>,
): Promise<unknown> {
  const jobId = String(args.jobId ?? "").trim();
  if (!jobId) {
    return { status: "error", jobId: "", message: "Job GUID to cancel was not specified." };
  }
  try {
    const { cancelArrowJob } = await import("@/features/jobs/arrow-job-client");
    await cancelArrowJob(jobId);
    const { useActiveJobsStore } = await import("@/store/slices/active-jobs-store");
    useActiveJobsStore.getState().updateJob(jobId, { status: "Cancelled" });
    return {
      status: "ok",
      jobId,
      message: `Job successfully cancelled (${jobId}).`,
    };
  } catch (err) {
    return {
      status: "error",
      jobId,
      message: err instanceof Error ? err.message : String(err),
    };
  }
}
