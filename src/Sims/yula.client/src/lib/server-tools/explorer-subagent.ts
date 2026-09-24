/**
 * @file explorer-subagent.ts
 * Minimalist Read-Only Explorer Sub-Agent (Pi Reference Pattern).
 * Investigates ScreenContracts, Bounded Contexts, data schemas, and Playbooks
 * to return structured findings to the primary General Agent without polluting
 * the Level-0 conversation context.
 */

import { generateText, tool } from "ai";
import { z } from "zod";
import { REGISTERED_REPORTS, findReport, type YulaReportMeta } from "@/features/reports/report-registry";
import { getYulaLanguageModel } from "../yula-provider";
import { resolveProvider } from "../yula-config";

export interface ExplorerSubagentParams {
  query: string;
  thoroughness?: "quick" | "medium" | "thorough";
  scope?: string;
  provider?: string;
  baseUrl?: string;
  timeoutMs?: number;
}

export interface ExplorerResult {
  status: "ok" | "fallback" | "error";
  targetRoute?: string;
  targetComponentId?: string;
  targetScope?: string;
  requiredFields: string[];
  fieldOptions: Record<string, string[]>;
  recommendedAction: string;
  findings: string;
}

const DEFAULT_TIMEOUT_MS = 4000;

export const EXPLORER_SYSTEM_PROMPT = [
  "You are an explore agent for Sims ERP. Quickly investigate screen contracts,",
  "bounded contexts, schemas, and playbooks, then return structured findings",
  "that the general agent can execute without re-reading entire definitions.",
  "",
  "Your output will be passed to an executive agent who has NOT seen the raw contracts or schemas.",
  "",
  "Thoroughness:",
  "- quick: Targeted lookups, key screen route only",
  "- medium: Inspect target contract, required fields, and enums",
  "- thorough: Check contract, data columns, dependent sagas, and playbooks",
  "",
  "Strategy:",
  "1. Locate relevant screen contract and route from registered reports.",
  "2. Read key contract sections (required fields, enum options, actions).",
  "3. Note dependencies or missing mandatory criteria.",
  "4. Synthesize concise structured findings.",
  "",
  "Output format:",
  "## Screen / Contract Retrieved",
  "List exact target route and component ID:",
  "- Target Route: `/path/to/screen`",
  "- Component ID: `criteria_form:<scope>` or `result_grid:active`",
  "",
  "## Key Criteria & Schema",
  "Critical fields, types, enum options, or invariants.",
  "",
  "## Recommended Next Step",
  "Action to execute (e.g. navigate to route, call ask_user_choice, or dispatch action).",
].join("\n");

/**
 * Deterministic contract matcher used as zero-latency fast-path & reliable fallback.
 */
export function matchScreenContract(query: string, scopeFilter?: string): YulaReportMeta | undefined {
  if (scopeFilter) {
    const direct = findReport(scopeFilter);
    if (direct) return direct;
  }
  const q = query.toLowerCase().trim();
  const qWords = q.split(/\s+/);

  // 1. Direct scope or title inclusion
  const directMatch = REGISTERED_REPORTS.find((r) => {
    if (r.scope.toLowerCase() === q) return true;
    if (r.title.toLowerCase().includes(q) || q.includes(r.title.toLowerCase())) return true;
    return r.aliases.some((a) => q.includes(a.toLowerCase()));
  });
  if (directMatch) return directMatch;

  // 2. Token-level alias / stem matching (e.g. "satış" in "satışlarını")
  return REGISTERED_REPORTS.find((r) => {
    return r.aliases.some((alias) => {
      const aliasTokens = alias.toLowerCase().split(/\s+/);
      return aliasTokens.some((aToken) => {
        if (aToken.length < 3) return false;
        return qWords.some((qWord) => qWord.startsWith(aToken) || qWord.includes(aToken));
      });
    });
  });
}

/**
 * Builds structured findings markdown from a report contract.
 */
export function formatExplorerFindings(
  report: YulaReportMeta,
  _options?: { query?: string; missingField?: string },
): ExplorerResult {
  const properties = report.criteriaSchema?.properties || {};
  const requiredFields: string[] = [];
  const fieldOptions: Record<string, string[]> = {};

  for (const [key, prop] of Object.entries(properties)) {
    if (Array.isArray(prop.enum) && prop.enum.length > 0) {
      fieldOptions[key] = prop.enum;
      requiredFields.push(key);
    } else if (key.toLowerCase().includes("tarih") || key.toLowerCase().includes("date")) {
      requiredFields.push(key);
    }
  }

  const lines = [
    "## Screen / Contract Retrieved",
    `- Target Route: \`${report.pagePath}\``,
    `- Screen Title: ${report.title} (scope: \`${report.scope}\`)`,
    `- Target Component: \`criteria_form:${report.scope}\``,
    "",
    "## Key Criteria & Schema",
    requiredFields.length > 0
      ? requiredFields
          .map((f) => {
            const opts = fieldOptions[f];
            return `- Field: \`${f}\`${opts ? ` (valid options: ${opts.join(", ")})` : " (date range)"}`;
          })
          .join("\n")
      : "- No strict criteria constraints found.",
    "",
    "## Recommended Next Step",
    `- Action: Call \`dispatch_component_action\` with component_id=\`app_router\` and action=\`NAVIGATE\` to \`${report.pagePath}\`.`,
  ];

  const firstOptionField = Object.keys(fieldOptions)[0];
  if (firstOptionField) {
    lines.push(
      `- Suspension: If \`${firstOptionField}\` is not specified by the user, invoke \`ask_user_choice\` with options [${fieldOptions[firstOptionField]?.join(", ")}].`,
    );
  }

  return {
    status: "ok",
    targetRoute: report.pagePath,
    targetComponentId: `criteria_form:${report.scope}`,
    targetScope: report.scope,
    requiredFields,
    fieldOptions,
    recommendedAction: `Navigate to ${report.pagePath}`,
    findings: lines.join("\n"),
  };
}

/**
 * Runs the isolated Explorer Sub-Agent.
 */
export async function runExplorerSubagent(
  params: ExplorerSubagentParams,
): Promise<ExplorerResult> {
  const { query, thoroughness = "medium", scope, timeoutMs = DEFAULT_TIMEOUT_MS } = params;

  // 1. Fast-Path: Deterministic screen contract matching
  const matchedReport = matchScreenContract(query, scope);
  const fastFindings = matchedReport ? formatExplorerFindings(matchedReport, { query }) : null;

  // For quick mode, fast-path is sufficient and saves an LLM round-trip
  if (thoroughness === "quick" && fastFindings) {
    return fastFindings;
  }

  // 2. LLM Explorer Execution with isolated read-only tools
  try {
    const activeProvider = resolveProvider(params.provider);
    const model = getYulaLanguageModel(undefined, {
      provider: activeProvider,
      baseUrl: params.baseUrl,
    });

    const explorerTools = {
      search_screens: tool({
        description: "Search registered screen contracts and report scopes by keyword",
        inputSchema: z.object({
          keyword: z.string().describe("Search keyword (e.g. 'satış', 'stok bakiye')"),
        }),
        outputSchema: z.object({
          results: z.array(
            z.object({
              scope: z.string(),
              title: z.string(),
              pagePath: z.string(),
              aliases: z.array(z.string()),
            }),
          ),
        }),
        execute: async ({ keyword }) => {
          const kw = keyword.toLowerCase();
          const results = REGISTERED_REPORTS.filter(
            (r) =>
              r.scope.toLowerCase().includes(kw) ||
              r.title.toLowerCase().includes(kw) ||
              r.aliases.some((a) => a.toLowerCase().includes(kw)),
          ).map((r) => ({
            scope: r.scope,
            title: r.title,
            pagePath: r.pagePath,
            aliases: r.aliases,
          }));
          return { results };
        },
      }),

      inspect_contract_schema: tool({
        description: "Inspect the criteria schema, required fields, and enums for a specific report scope",
        inputSchema: z.object({
          scope: z.string().describe("Target report scope (e.g. 'retail-sales-report')"),
        }),
        outputSchema: z.object({
          scope: z.string(),
          title: z.string(),
          pagePath: z.string(),
          fields: z.record(z.string(), z.any()),
        }),
        execute: async ({ scope }) => {
          const report = findReport(scope);
          if (!report) {
            return { scope, title: "", pagePath: "", fields: {} };
          }
          return {
            scope: report.scope,
            title: report.title,
            pagePath: report.pagePath,
            fields: report.criteriaSchema.properties,
          };
        },
      }),
    };

    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), timeoutMs);

    try {
      const response = await (generateText as any)({
        model: model as any,
        system: EXPLORER_SYSTEM_PROMPT,
        prompt: `Investigate the following request with thoroughness="${thoroughness}":\n"${query}"`,
        tools: explorerTools,
        maxSteps: 3,
        abortSignal: abortController.signal,
      });

      clearTimeout(timeoutId);

      if (response.text.trim()) {
        return {
          status: "ok",
          targetRoute: fastFindings?.targetRoute,
          targetComponentId: fastFindings?.targetComponentId,
          targetScope: fastFindings?.targetScope,
          requiredFields: fastFindings?.requiredFields || [],
          fieldOptions: fastFindings?.fieldOptions || {},
          recommendedAction: fastFindings?.recommendedAction || "Execute recommended next step",
          findings: response.text.trim(),
        };
      }
    } catch {
      // Abort or LLM failure gracefully handled below
    } finally {
      clearTimeout(timeoutId);
    }
  } catch {
    // LLM invocation setup failure
  }

  // 3. Fallback to deterministic contract findings or generic guidance
  if (fastFindings) {
    return { ...fastFindings, status: "fallback" };
  }

  return {
    status: "fallback",
    requiredFields: [],
    fieldOptions: {},
    recommendedAction: "Consult available modules via /stock, /selling, or /accounting",
    findings: [
      "## Screen / Contract Retrieved",
      "- Target Route: Unknown (No matching screen contract found in registry).",
      "",
      "## Recommended Next Step",
      "- Ask the user for clarification or direct them to registered enterprise modules.",
    ].join("\n"),
  };
}
