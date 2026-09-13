import { z } from "zod";

export interface YulaGridToolContext {
  tableName: string;
  columns: string[];
  rowCount?: number | null;
  /** Kolon → tip ("date"|"number"|"bool"|"text") — Arrow/şemasından; LLM şema grounding'i */
  columnTypes?: Record<string, string>;
  /** Düşük kardinaliteli kolon değerleri — benzersiz kimlik kolonlarını ayıklamak için */
  columnValues?: Record<string, string[]>;
}

/** Per-request tool context (SDK: description functions + toolsContext).
 *  Resolved in the chat route from the active screen/report scope.
 *  Null scope/title = no active report on this screen (never invent one). */
export const reportToolContextSchema = z.object({
  reportScope: z.string().nullable(),
  reportTitle: z.string().nullable(),
  requiredFields: z.array(z.string()),
  availableReports: z.string(),
});

export type ReportToolContext = z.infer<typeof reportToolContextSchema>;

const FALLBACK_TOOL_CONTEXT: ReportToolContext = {
  reportScope: null,
  reportTitle: null,
  requiredFields: [],
  availableReports: "",
};

export function toolContextOf(options?: {
  context?: ReportToolContext | unknown;
}): ReportToolContext {
  const c = options?.context as Partial<ReportToolContext> | undefined;
  return {
    reportScope:
      typeof c?.reportScope === "string" && c.reportScope
        ? c.reportScope
        : FALLBACK_TOOL_CONTEXT.reportScope,
    reportTitle:
      typeof c?.reportTitle === "string" && c.reportTitle
        ? c.reportTitle
        : FALLBACK_TOOL_CONTEXT.reportTitle,
    requiredFields: Array.isArray(c?.requiredFields)
      ? (c.requiredFields as string[])
      : [],
    availableReports:
      typeof c?.availableReports === "string" ? c.availableReports : "",
  };
}

/**
 * Active-report sentence for dynamic descriptions. Unknown scope is stated
 * explicitly so the model identifies the target first instead of assuming
 * a default report.
 */
export function activeReportLine(ctx: ReportToolContext): string {
  if (ctx.reportScope) return `Active report: '${ctx.reportScope}'.`;
  return (
    "No active report on this screen — identify the target report first " +
    "(RAG routing context / report catalog + 'get_report_schema'), then pass " +
    "its scope explicitly. Never assume a default report."
  );
}
