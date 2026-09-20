import { findReport } from "@/features/reports/report-registry";
import { focusReportExecution, reportExecutionHref } from "@/lib/report-run-bus";
import {
  isCriteriaMatch,
  normalizeCriteria,
  normalizeCriteriaValue,
} from "@/lib/criteria-match";
import { deferredManager } from "@my-agent/core";

/**
 * Layer 3: Criteria Input Engine & Job Lifecycle araçları —
 * `run_job`, `apply_criteria`, `navigate_to_page`, `open_last_report`,
 * `validate_criteria_input`, `get_current_criteria`, `find_matching_report`,
 * `list_report_executions`, `cancel_job`.
 * Davranış `yula-client-tools.ts` ile birebirdir.
 */

/**
 * Aktif ekranın rapor kapsamını dinamik olarak çözer.
 * Eğer araç çağrısında explicit scope verilmemişse:
 * 1. Aktif ekran grid/screen mağazası (screen?.reportScope)
 * 2. Tarayıcı URL yolu (REGISTERED_REPORTS eşleşmesi)
 * kontrollerini yaparak ekrandaki aktif raporu bulur.
 */
export async function resolveCurrentReportScope(explicit?: unknown): Promise<string> {
  const explicitStr = typeof explicit === "string" ? explicit.trim().toLowerCase() : "";
  if (explicitStr) return explicitStr;

  try {
    const { useYulaGridStore } = await import("@/lib/stores/grid");
    const screenScope = useYulaGridStore.getState().screen?.reportScope;
    if (screenScope) return screenScope.trim().toLowerCase();
  } catch {}

  if (typeof window !== "undefined") {
    try {
      const currentPath = window.location.pathname;
      const { REGISTERED_REPORTS } = await import("@/features/reports/report-registry");
      const matched = REGISTERED_REPORTS.find((r) => currentPath.startsWith(r.pagePath));
      if (matched) return matched.scope.toLowerCase();
    } catch {}
  }

  return "";
}

export async function runJobTool(
  args: Record<string, unknown>,
): Promise<unknown> {
  const scope = await resolveCurrentReportScope(args.report);
  if (!scope) {
    return {
      status: "validation-error",
      errors: ["'report' (report scope) is required — identify the target report first, never assume a default."],
      hint: "Use the RAG routing context or report catalog + 'get_report_schema', then pass the scope explicitly.",
    };
  }
  const meta =
    (
      await import("@/features/reports/report-registry")
    ).findReport(scope);
  if (!meta) {
    return { status: "error", error: `Unknown report: ${scope}` };
  }
  try {
    const { applyCriteriaToDraft, resolveRelativeDateString } =
      await import("@/features/report-criteria/lib/apply-criteria-to-draft");
    const { validateCriteria } =
      await import("@/features/report-criteria/lib/validate-criteria");
    const criteriaObj = { ...((args.criteria ?? {}) as Record<string, unknown>) };

    // Relative date synthesizer & default fallback for date criteria.
    // The date field is resolved from the schema (first date/range field),
    // never hardcoded per report.
    const { parseCriteriaSchema } = await import(
      "@/features/report-criteria/lib/parse-criteria-schema"
    );
    const schemaFields = parseCriteriaSchema(meta.fullSchema).fields;
    const dateFieldKey = schemaFields.find(
      (f) =>
        (f as { format?: string }).format === "date" ||
        Boolean((f as { rangeSplit?: string }).rangeSplit),
    )?.key;
    const resolveDate =
      typeof resolveRelativeDateString === "function"
        ? resolveRelativeDateString
        : (val: string) => {
            const v = val.toLowerCase().trim();
            const today = new Date();
            const todayIso = today.toISOString().slice(0, 10);
            if (v === "dün" || v === "dun" || v === "yesterday") {
              const d = new Date(today);
              d.setDate(d.getDate() - 1);
              return d.toISOString().slice(0, 10);
            }
            if (v === "bugün" || v === "bugun" || v === "today") return todayIso;
            return val;
          };

    if (dateFieldKey) {
      if (!criteriaObj[dateFieldKey]) {
        const dun = new Date();
        dun.setDate(dun.getDate() - 1);
        criteriaObj[dateFieldKey] = dun.toISOString().slice(0, 10);
      } else if (typeof criteriaObj[dateFieldKey] === "string") {
        criteriaObj[dateFieldKey] = resolveDate(
          criteriaObj[dateFieldKey] as string,
        );
      } else if (
        criteriaObj[dateFieldKey] &&
        typeof criteriaObj[dateFieldKey] === "object"
      ) {
        const obj = criteriaObj[dateFieldKey] as Record<string, unknown>;
        const from = String(obj.from ?? obj.start ?? obj.min ?? "").trim();
        const to = String(obj.to ?? obj.end ?? obj.max ?? "").trim();
        if (from || to) {
          criteriaObj[dateFieldKey] =
            from && to ? `${from}..${to}` : from ? `${from}..` : `..${to}`;
        }
      }
    }

    // Form taslağına da uygula (ekrandaki kriter tablosu eşzamanlı güncellensin)
    applyCriteriaToDraft(scope, criteriaObj, meta.fullSchema);

    const result = validateCriteria(
      meta.fullSchema,
      criteriaObj,
    );
    if (!result.valid) {
      return {
        status: "validation-error",
        errors: result.errors.map((e) => e.message).slice(0, 5),
        hint: "Correct via criteria form or provide valid criteria fields.",
      };
    }
    if (!result.jobEndpoint) {
      return { status: "error", error: "Missing x-job-endpoint in schema." };
    }
    const { createArrowJob } = await import(
      "@/features/jobs/arrow-job-client"
    );
    const job = await createArrowJob(result.jobEndpoint, result.instance);

    const { useActiveJobsStore } = await import(
      "@/store/slices/active-jobs-store"
    );
    useActiveJobsStore.getState().addJob({
      id: job.id,
      name: scope,
      title: meta.title,
      href: `${meta.pagePath}/${job.id}`,
      status: job.status,
      eventsUrl: job.eventsUrl,
      jobUrl: job.jobUrl,
      createdAt: new Date().toISOString(),
      notificationType: "report",
      workspace: "/stock",
      payload: result.instance,
    });

    focusReportExecution({
      scope,
      job,
      request: result.instance,
    });

    const preset = typeof args.presetTitle === "string" ? args.presetTitle : undefined;

    // ⏱️ Pi Deferred: Uzun süren rapor işini deferred yöneticisine kaydet
    try {
      const { promise } = deferredManager.createDeferred(
        job.id,
        { scope, jobId: job.id, preset },
        180000,
        job.id,
      );
      // Zaman aşımı veya iptal durumunda unhandled rejection oluşmasını önle
      promise.catch((err) => {
        if (process.env.NODE_ENV === "development") {
          console.warn(`[DeferredManager] Job ${job.id} deferred wait ended:`, err?.message || err);
        }
      });
    } catch {
      // Best-effort deferred registration
    }
    return {
      status: "executed",
      jobId: job.id,
      jobStatus: job.status,
      navigateTo: reportExecutionHref(meta.pagePath, job.id),
      presetTitle: preset,
      message: preset
        ? `Job accepted and queued (${job.id}) for preset "${preset}". Terminal outcome unknown — track on execution screen.`
        : `Job accepted and queued (${job.id}). Terminal outcome unknown — track on execution screen.`,
    };
  } catch (err) {
    return {
      status: "error",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function applyCriteriaTool(
  args: Record<string, unknown>,
): Promise<unknown> {
  const scope = await resolveCurrentReportScope(args.report);
  if (!scope) {
    return {
      status: "error",
      reason: "missing-report-scope",
      message: "'report' (report scope) is required — identify the target report first, never assume a default.",
      hint: "Use the RAG routing context or report catalog + 'get_report_schema', then pass the scope explicitly.",
    };
  }
  const criteriaObj = (args.criteria ?? {}) as Record<string, unknown>;
  try {
    const { applyCriteriaToDraft } = await import(
      "@/features/report-criteria/lib/apply-criteria-to-draft"
    );
    const res = applyCriteriaToDraft(scope, criteriaObj);
    const preset = typeof args.presetTitle === "string" ? args.presetTitle : "";
    // Deterministic completeness check: required schema fields still empty
    // in the draft, so the model asks for them explicitly instead of
    // claiming the report is runnable.
    const schemaRequired = (
      findReport(scope)?.fullSchema as { required?: unknown } | undefined
    )?.required;
    const requiredFields = Array.isArray(schemaRequired)
      ? (schemaRequired as unknown[]).filter(
          (f): f is string => typeof f === "string",
        )
      : [];
    const missingRequired = requiredFields.filter((f) => {
      const row = res.rows.find(
        (r) => r.name === f || r.name.toLowerCase() === f.toLowerCase(),
      );
      return !row || !row.value.trim();
    });
    // Deterministic next action: when the draft was filled outside the
    // report screen, hand the model the exact target path so the chain
    // continues with navigate_to_page in the SAME turn (no guessing).
    const currentPath =
      typeof window !== "undefined" ? window.location.pathname : "";
    const targetPath = findReport(scope)?.pagePath;
    const navigateTo =
      targetPath && currentPath !== targetPath ? targetPath : undefined;
    return {
      status: "ok",
      updatedKeys: res.updatedKeys,
      missingRequired,
      navigateTo,
      message:
        missingRequired.length > 0
          ? `Criteria applied to the draft form. Still missing required criteria: ${missingRequired.join(", ")}. Ask the user for them explicitly before running.`
          : preset
            ? `"${preset}" criteria applied to the draft form. All required criteria are filled; user can run the report.`
            : "Criteria applied to the draft form. All required criteria are filled; user can run the report.",
    };
  } catch (err) {
    return {
      status: "error",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

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

export async function validateCriteriaInputTool(
  args: Record<string, unknown>,
): Promise<unknown> {
  const scope = await resolveCurrentReportScope(args.report);
  if (!scope) {
    return {
      valid: false,
      scope: "unknown",
      reportTitle: "unknown",
      summary: "'report' (report scope) is required — identify the target report first, never assume a default.",
      errors: [{ field: "report", fieldTitle: "Report", message: "'report' is required." }],
      warnings: [],
    };
  }
  const { findReport } = await import("@/features/reports/report-registry");
  const meta = findReport(scope);
  if (!meta) {
    return {
      valid: false,
      scope,
      reportTitle: scope,
      summary: `Unknown report: '${scope}'`,
      errors: [{ field: "report", fieldTitle: "Report", message: `Unknown report: '${scope}'` }],
      warnings: [],
    };
  }
  const { validateCriteriaInput } = await import("@/features/report-criteria");
  const criteriaObj = (args.criteria ?? {}) as Record<string, unknown>;
  const partial = Boolean(args.partial);
  return validateCriteriaInput(meta.fullSchema, criteriaObj, { scope, partial });
}

export async function getCurrentCriteriaTool(
  args: Record<string, unknown>,
): Promise<unknown> {
  const scope = await resolveCurrentReportScope(args.report);
  if (!scope) {
    return {
      status: "error",
      scope: "unknown",
      reportTitle: "unknown",
      valid: false,
      summary: "'report' (report scope) is required — identify the target report first, never assume a default.",
      instance: {},
      errors: [{ field: "report", fieldTitle: "Report", message: "'report' is required." }],
      warnings: [],
    };
  }
  const { evaluateCurrentDraftCriteria } = await import("@/features/report-criteria");
  try {
    const res = evaluateCurrentDraftCriteria(scope);
    return {
      status: "ok",
      scope: res.scope,
      reportTitle: res.reportTitle,
      valid: res.report.valid,
      summary: res.report.summary,
      instance: res.instance,
      errors: res.report.errors,
      warnings: res.report.warnings,
    };
  } catch (err) {
    return {
      status: "error",
      scope,
      reportTitle: scope,
      valid: false,
      summary: err instanceof Error ? err.message : String(err),
      instance: {},
      errors: [{ field: "form", fieldTitle: "Form", message: String(err) }],
      warnings: [],
    };
  }
}

export async function findMatchingReportTool(
  args: Record<string, unknown>,
): Promise<unknown> {
  const scope = await resolveCurrentReportScope(args.report);
  if (!scope) {
    return { status: "error", error: "'report' (report scope) is required — identify the target report first, never assume a default." };
  }
  const rawCriteria = { ...((args.criteria ?? {}) as Record<string, unknown>) };
  try {
    const { findReport } = await import("@/features/reports/report-registry");
    const meta = findReport(scope);
    if (!meta) {
      return { status: "error", error: `Unknown report: ${scope}` };
    }
    const { resolveRelativeDateString } = await import(
      "@/features/report-criteria/lib/apply-criteria-to-draft"
    );
    const { validateCriteria } = await import(
      "@/features/report-criteria/lib/validate-criteria"
    );
    const resolveDate =
      typeof resolveRelativeDateString === "function"
        ? resolveRelativeDateString
        : undefined;
    // Resolve relative dates on raw input before validation.
    for (const [k, v] of Object.entries(rawCriteria)) {
      if (typeof v === "string") {
        rawCriteria[k] = normalizeCriteriaValue(v, resolveDate);
      }
    }
    const result = validateCriteria(meta.fullSchema, rawCriteria);
    const required = Array.isArray(
      (meta.fullSchema as { required?: unknown })?.required,
    )
      ? ((meta.fullSchema as { required?: string[] }).required ?? [])
      : [];
    const missing = required.filter((f) => {
      const v = (result.instance as Record<string, unknown>)?.[f];
      return v === undefined || v === null || String(v).trim() === "";
    });
    if (missing.length > 0) {
      return {
        status: "needs_criteria",
        missing,
        hint: "Ask user for missing required criteria before starting a job.",
        message: `Missing required criteria: ${missing.join(", ")}.`,
      };
    }
    const requested = normalizeCriteria(
      result.instance as Record<string, unknown>,
      undefined,
    );
    const endpoint =
      typeof meta?.fullSchema?.["x-job-endpoint"] === "string"
        ? (meta.fullSchema["x-job-endpoint"] as string)
        : "/api/arrow/jobs";
    const { listArrowJobs, fetchJobRequest } = await import(
      "@/features/jobs/arrow-job-client"
    );
    const res = await listArrowJobs(endpoint, { take: 10 });
    const items = (res.items || []).slice(0, 10);
    const withRequests = await Promise.allSettled(
      items.map(async (j) => ({
        job: j,
        request: await fetchJobRequest(j.id),
      })),
    );
    const candidates: Array<{
      jobId: string;
      status: string;
      createdAt: string;
      request: Record<string, unknown>;
    }> = [];
    for (const r of withRequests) {
      if (r.status !== "fulfilled" || !r.value.request) continue;
      candidates.push({
        jobId: r.value.job.id,
        status: r.value.job.status,
        createdAt: r.value.job.createdAt ?? "",
        request: normalizeCriteria(
          r.value.request as Record<string, unknown>,
          undefined,
        ),
      });
    }
    const isActive = (s: string) => s === "Queued" || s === "Running";
    const activeMatch = candidates.find(
      (c) => isActive(c.status) && isCriteriaMatch(requested, c.request),
    );
    if (activeMatch) {
      return {
        status: "running",
        jobId: activeMatch.jobId,
        jobStatus: activeMatch.status,
        navigateTo: reportExecutionHref(meta.pagePath, activeMatch.jobId),
        message: `Matching job is still running (${activeMatch.jobId}).`,
      };
    }
    const completedMatch = candidates
      .filter((c) => c.status === "Completed")
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .find((c) => isCriteriaMatch(requested, c.request));
    if (completedMatch) {
      return {
        status: "matched",
        jobId: completedMatch.jobId,
        jobStatus: completedMatch.status,
        navigateTo: reportExecutionHref(meta.pagePath, completedMatch.jobId),
        message: `Opened matching completed report (job ${completedMatch.jobId}).`,
      };
    }
    return {
      status: "no_match",
      suggestedCriteria: result.instance as Record<string, unknown>,
      hint: "No completed job matches these criteria. Ask for confirmation before calling run_job.",
      message: "No completed job matches these criteria.",
    };
  } catch (err) {
    return {
      status: "error",
      error: err instanceof Error ? err.message : String(err),
    };
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
