/**
 * Criteria Grid & Report Criteria Form AI Grounding.
 * Pure TypeScript (Server-safe, zero React/DOM imports) for Node.js API prompt generation.
 */

export interface ActiveReportCriteriaContext {
  title: string;
  scope: string;
  workspace?: string;
}

/**
 * Aktif rapor kriter formu için sistem promptu direktiflerini formatlar.
 */
export function formatCriteriaPromptGrounding(
  activeReport: ActiveReportCriteriaContext
): string {
  return [
    `ACTIVE REPORT CONTEXT RULE & DIRECT EXECUTION (${activeReport.title} — ${activeReport.scope}):`,
    `• The user is currently on the "${activeReport.title}" report screen (scope: "${activeReport.scope}").`,
    `• When the user asks about report executions, past runs, job counts, criteria, or results (e.g. 'kaç rapor çalışmış', 'çalışma geçmişini göster', 'önceki sonuçlar', 'raporu çalıştır', 'filtrele') without specifying a different report:`,
    `  - NEVER ask which report they mean. They are ALREADY viewing this report screen.`,
    `  - Directly assume the request refers to "${activeReport.title}" (scope: "${activeReport.scope}").`,
    `  - To answer past runs / count questions, call dispatch_component_action with component_id="job_history" and action="LIST" (payload: { report: "${activeReport.scope}" }) and summarize the executions clearly in the user's language.`,
    `• DIRECT EXECUTION MODE: The criteria form is active. Apply criteria via 'SET_FIELDS' and execute via 'SUBMIT' directly as requested by the user without introducing an unnecessary plan approval card first.`,
  ].join("\n");
}
