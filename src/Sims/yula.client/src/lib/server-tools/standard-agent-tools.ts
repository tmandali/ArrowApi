import { tool } from "ai";
import { z } from "zod";
import { synthesizeCollectedInformationTool } from "./thinking-tools";

/**
 * Headless React UI-Agent (@my-agent/core) standart sunucu araç seti.
 * 20+ eski gereksiz aracın yerini alan birleşik, modüler ve güvenli araçlar.
 */
export const STANDARD_AGENT_TOOLS = {
  dispatch_component_action: tool({
    description: [
      "Dispatch an action to an active UI component on the screen (criteria form, result grid, app router, job history).",
      "Canonical actions & examples:",
      "- Fill criteria: component_id='criteria_form:<scope>', action='SET_FIELDS', payload={ storeId: 'Kadıköy', dateRange: '2026-09-01..2026-09-30' }.",
      "- Run report: component_id='criteria_form:<scope>', action='SUBMIT', payload={ report: '<scope>' }.",
      "- Query grid data: component_id='result_grid:active', action='RUN_SQL', payload={ query: 'SELECT Category, SUM(Amount) FROM active_view GROUP BY 1' }.",
      "- Filter column: component_id='result_grid:active', action='FILTER', payload={ field: 'Category', value: 'Elektronik', op: 'eq' }.",
      "- Sort column: component_id='result_grid:active', action='SORT', payload={ column: 'Amount', direction: 'desc' }.",
      "- Export grid: component_id='result_grid:active', action='EXPORT', payload={ format: 'xlsx' }.",
      "- Visualize chart: component_id='result_grid:active', action='VISUALIZE', payload={ type: 'bar', dimension: 'Store', metric: 'Amount', limit: 5, orderMode: 'value_desc', title: 'Top 5 Stores' }.",
      "- Navigate: component_id='app_router', action='NAVIGATE', payload={ path: '/retail/sales' }.",
      "- Open last report: component_id='job_history', action='OPEN_LAST', payload={}.",
    ].join(" "),
    inputSchema: z.object({
      component_id: z.string().describe("Target component identifier (e.g. 'criteria_form:retail-sales', 'result_grid:active', 'app_router', 'job_history')"),
      action: z.string().describe("Canonical action to perform (e.g. 'SET_FIELDS', 'SUBMIT', 'RUN_SQL', 'VISUALIZE', 'FILTER', 'SORT', 'EXPORT', 'NAVIGATE')"),
      payload: z.record(z.string(), z.any()).optional().default({}).describe("Action parameters and payload data"),
    }),
    outputSchema: z.object({
      success: z.boolean().optional(),
      result: z.any().optional(),
      message: z.string().optional(),
      error: z.string().optional(),
      navigatedTo: z.string().optional(),
      status: z.string().optional(),
    }),
  }),

  inspect_ui_state: tool({
    description: "Inspect the current UI state, mounted components, route, active filters, or targeted UI telemetry events.",
    inputSchema: z.object({
      component_id: z.string().optional().describe("Optional target component ID to inspect specifically (e.g. 'criteria_form:retail-sales' or 'result_grid:active')"),
      topic: z.enum(['jobs', 'data', 'form', 'navigation', 'system']).optional().describe("Filter telemetry events by topic/category"),
      source: z.string().optional().describe("Filter telemetry events by source component identifier"),
      event_type: z.string().optional().describe("Filter telemetry events by event type (e.g. ROW_SELECTED, REPORT_COMPLETED)"),
      correlation_id: z.string().optional().describe("Filter events by causality correlation ID (e.g. jobId)"),
      min_severity: z.enum(['info', 'warn', 'critical']).optional().describe("Filter events by minimum severity level"),
      limit: z.number().optional().describe("Maximum number of events to return (default: 10)"),
    }),
    outputSchema: z.object({
      success: z.boolean().optional(),
      route: z.string().optional(),
      phase: z.string().optional(),
      activeComponents: z.array(z.string()).optional(),
      state: z.any().optional(),
      recent_events: z
        .array(
          z.object({
            source: z.string().describe("Source component of the event"),
            type: z.string().describe("Event type name"),
            topic: z.string().optional().describe("Topic category"),
            payload: z.any().optional().describe("Event payload data"),
            timestamp: z.number().optional().describe("Event timestamp in milliseconds"),
            age: z.string().optional().describe("Relative elapsed time (e.g. 2s ago)"),
            correlationId: z.string().optional().describe("Correlation ID"),
            severity: z.string().optional().describe("Event severity level"),
          }),
        )
        .optional()
        .describe("Ring-buffer telemetry events from active UI components"),
      available_topics: z.any().optional().describe("Available telemetry topics and schemas"),
      message: z.string().optional(),
      error: z.string().optional(),
    }),
  }),

  ask_user_choice: tool({
    description: "Prompt the user with interactive choice buttons. Whenever asking the user to make a choice or decision, provide concise single-line options with a clear label, an optional brief description, and an optional badge.",
    inputSchema: z.object({
      question: z.string().describe("Question or decision prompt to present to the user"),
      options: z
        .array(
          z.union([
            z.string(),
            z.object({
              label: z.string().describe("Option button label / title (concise single-line)"),
              value: z.string().optional().describe("Returned value when selected"),
              description: z.string().optional().describe("Brief 1-phrase explanation of what will happen if selected"),
              rationale: z.string().optional().describe("Deprecated/Optional: Keep options concise without verbose multi-line rationales"),
              badge: z.string().optional().describe("Optional badge tag, e.g. 'Önerilen', 'Standart', 'Kurumsal Kural'"),
            }),
          ]),
        )
        .min(1)
        .describe("List of selectable options. Keep options concise and single-line."),
      allow_custom: z.boolean().optional().default(true).describe("Allow custom text input below options"),
      custom_placeholder: z
        .string()
        .optional()
        .describe("Watermark/placeholder hint for the custom input box in the user's language (e.g. 'Örn: 2026-09-01..2026-09-15' or 'Örn: TJ01')"),
    }),
    outputSchema: z.object({
      selected: z.string().optional(),
      value: z.string().optional(),
      custom: z.string().optional(),
      cancelled: z.boolean().optional(),
    }),
  }),

  remember_fact: tool({
    description: "Save a user preference, fact, or custom rule into memory.",
    inputSchema: z.object({
      key: z.string().describe("Memory key (e.g. preferred_store, user_role)"),
      value: z.any().describe("Value to store"),
      scope: z.enum(["session", "persistent"]).default("session").describe("Memory scope"),
      description: z.string().optional().describe("Description of this memory item"),
    }),
    outputSchema: z.object({
      status: z.string(),
      key: z.string().optional(),
      scope: z.string().optional(),
      message: z.string().optional(),
    }),
    execute: async ({ key, value, scope, description }) => {
      try {
        const { agentMemory } = await import("@my-agent/core");
        agentMemory.remember(key, value, scope, description);
        return { status: "saved", key, scope, message: `Preference "${key}" saved.` };
      } catch (err: any) {
        return { status: "error", message: err?.message || "Failed to save memory" };
      }
    },
  }),

  recall_fact: tool({
    description: "Recall a stored preference or all memories from agent memory.",
    inputSchema: z.object({
      key: z.string().optional().describe("Memory key to query (empty to list all)"),
    }),
    outputSchema: z.object({
      status: z.string(),
      key: z.string().optional(),
      value: z.any().optional(),
      memories: z.array(z.any()).optional(),
      message: z.string().optional(),
    }),
    execute: async ({ key }) => {
      try {
        const { agentMemory } = await import("@my-agent/core");
        if (key) {
          const val = agentMemory.recall(key);
          return { status: "found", key, value: val };
        }
        return { status: "all", memories: agentMemory.getAll() };
      } catch (err: any) {
        return { status: "error", message: err?.message || "Failed to recall memory" };
      }
    },
  }),

  query_playbook: tool({
    description: "Query verified organizational playbooks, operational screen rules, or multi-step workflow recipes from the LLM Wiki.",
    inputSchema: z.object({
      task: z.string().describe("The task, topic, or screen path to search playbooks for (e.g. 'stok mutabakatı', 'fire analizi', '/stock/stock-balance')"),
      workspace: z.string().optional().default("stock").describe("Workspace ID (defaults to 'stock')"),
    }),
    outputSchema: z.object({
      status: z.string(),
      level: z.string().optional(),
      workspaceId: z.string().optional(),
      task: z.string().optional(),
      matched: z.boolean().optional(),
      confidence: z.number().optional(),
      screenRules: z.array(z.string()).optional(),
      recipe: z.any().optional(),
      relevantIndex: z.array(z.any()).optional(),
      rulesCount: z.number().optional(),
      message: z.string().optional(),
    }),
    execute: async ({ task, workspace }) => {
      try {
        const { serverPlaybookService } = await import("@/lib/playbook-server");
        const wsId = workspace || "stock";
        const result = await serverPlaybookService.resolveIntent(task, wsId);
        return {
          status: result.status,
          level: "workspace",
          workspaceId: wsId,
          task,
          matched: result.matched,
          confidence: result.confidence,
          screenRules: result.screenRules,
          recipe: result.recipe,
          relevantIndex: result.relevantIndex,
          rulesCount: result.screenRules?.length ?? 0,
          message: result.explanation,
        };
      } catch (err: any) {
        return { status: "error", message: err?.message || "Failed to query playbook" };
      }
    },
  }),

  propose_playbook_update: tool({
    description: "Propose a learned operational rule or multi-step workflow recipe for the organizational Playbook wiki. Creates a draft proposal requiring user approval in /system/playbooks (proposals tab).",
    inputSchema: z.object({
      category: z.enum(["screen_rule", "workflow_recipe"]).describe("Type of playbook entry: screen_rule or workflow_recipe"),
      title: z.string().describe("Short descriptive title for this rule or recipe"),
      content: z.string().describe("The markdown content of the rule or recipe"),
      target_path: z.string().optional().describe("Target screen route (e.g. /stock/stock-balance) if this is a screen rule"),
      workspace: z.string().optional().default("stock").describe("Target workspace"),
    }),
    outputSchema: z.object({
      status: z.string(),
      level: z.string().optional(),
      workspaceId: z.string().optional(),
      category: z.string().optional(),
      title: z.string().optional(),
      targetPath: z.string().optional(),
      entry: z.any().optional(),
      message: z.string().optional(),
    }),
    execute: async ({ category, title, content, target_path, workspace }) => {
      try {
        const { serverPlaybookService } = await import("@/lib/playbook-server");
        const wsId = workspace || "stock";
        const entry = await serverPlaybookService.proposeEntry({
          category,
          title,
          contentMarkdown: content,
          targetPath: target_path,
          workspaceId: wsId,
          scope: "workspace",
          author: "Yula AI (Learned)",
          proposedBy: "Yula AI (Learned)",
        });
        return {
          status: "proposed",
          level: "workspace",
          workspaceId: wsId,
          category,
          title,
          targetPath: target_path,
          entry,
          message: `Proposal "${title}" saved as draft (${entry.id}). Ask the user to approve it in /system/playbooks → Proposals tab for workspace "${wsId}".`,
        };
      } catch (err: any) {
        return { status: "error", message: err?.message || "Failed to update playbook" };
      }
    },
  }),

  synthesize_collected_information: synthesizeCollectedInformationTool,

  explore_context: tool({
    description: "Delegate investigation to the read-only Explorer Sub-Agent. Quickly analyzes screen contracts, Bounded Contexts, data schemas, or playbooks and returns structured findings for execution without cluttering the main conversation.",
    inputSchema: z.object({
      query: z.string().describe("Target task, question, or screen to investigate (e.g. 'satış raporu kriterleri', 'stok bakiye tablosu kolonları', 'siparişten irsaliyeye onay akışı')"),
      thoroughness: z.enum(["quick", "medium", "thorough"]).optional().default("medium").describe("Depth of exploration"),
      scope: z.string().optional().describe("Optional scope or workspace filter"),
    }),
    outputSchema: z.object({
      status: z.string(),
      targetRoute: z.string().optional(),
      targetComponentId: z.string().optional(),
      targetScope: z.string().optional(),
      requiredFields: z.array(z.string()).optional(),
      fieldOptions: z.record(z.string(), z.array(z.string())).optional(),
      recommendedAction: z.string().optional(),
      findings: z.string(),
    }),
    execute: async ({ query, thoroughness, scope }) => {
      try {
        const { runExplorerSubagent } = await import("./explorer-subagent");
        return await runExplorerSubagent({ query, thoroughness, scope });
      } catch (err: any) {
        return {
          status: "error",
          requiredFields: [],
          fieldOptions: {},
          recommendedAction: "Fallback to direct navigation",
          findings: `Explorer subagent failed: ${err?.message || String(err)}`,
        };
      }
    },
  }),
};

export type StandardAgentTools = typeof STANDARD_AGENT_TOOLS;
