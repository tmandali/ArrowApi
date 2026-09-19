import { tool } from "ai";
import { z } from "zod";

/**
 * Headless React UI-Agent (@my-agent/core) standart sunucu araç seti.
 * 20+ eski gereksiz aracın yerini alan birleşik, modüler ve güvenli araçlar.
 */
export const STANDARD_AGENT_TOOLS = {
  dispatch_component_action: tool({
    description: [
      "Dispatch an action to an active UI component on the screen (criteria form, result grid, app router, job history).",
      "Usage:",
      "- Criteria Form: component_id='criteria_form:<scope>', action='SET_FIELDS' | 'APPLY' | 'SUBMIT' | 'RUN' | 'VALIDATE' | 'READ', payload={ criteria, report }.",
      "- Result Grid: component_id='result_grid:active', action='RUN_SQL' | 'QUERY' | 'FILTER' | 'SORT' | 'EXPORT' | 'COLUMNS' | 'PIN' | 'RESET_LAYOUT' | 'VISUALIZE' | 'ANALYZE' | 'PROFILE', payload={ ... }.",
      "- App Router: component_id='app_router', action='NAVIGATE', payload={ path }.",
      "- Job History: component_id='job_history', action='OPEN_LAST' | 'LIST' | 'FIND' | 'CANCEL', payload={ ... }.",
      "- Plugins: component_id='plugin:<name>', action='<toolName>', payload={ ... }.",
    ].join(" "),
    inputSchema: z.object({
      component_id: z.string().describe("Target component identifier (e.g. 'criteria_form:retail-sales', 'result_grid:active', 'app_router', 'job_history', 'plugin:stock-predictive-analytics')"),
      action: z.string().describe("Action to perform (e.g. 'SET_FIELDS', 'SUBMIT', 'APPLY', 'RUN', 'RUN_SQL', 'FILTER', 'SORT', 'EXPORT', 'NAVIGATE')"),
      payload: z.record(z.string(), z.any()).optional().default({}).describe("Action parameters and criteria"),
    }),
  }),

  inspect_ui_state: tool({
    description: "Inspect the current UI state, active screen components, route, or open table schema.",
    inputSchema: z.object({
      component_id: z.string().optional().describe("Optional target component ID to inspect specifically"),
    }),
  }),

  ask_user_choice: tool({
    description: "Prompt the user with interactive choice buttons or a clarification question with predefined options and an optional custom input.",
    inputSchema: z.object({
      question: z.string().describe("Question or decision prompt to present to the user"),
      options: z
        .array(
          z.union([
            z.string(),
            z.object({
              label: z.string().describe("Option button label"),
              value: z.string().optional().describe("Returned value when selected"),
              description: z.string().optional().describe("Additional description"),
            }),
          ]),
        )
        .min(1)
        .describe("List of selectable options. ONLY concrete choices (e.g. 'Son 7 gün', 'Son 30 gün', 'TJ01'). Do not add placeholder options for typing; if custom input is allowed, provide a format hint in custom_placeholder instead."),
      allow_custom: z.boolean().optional().default(true).describe("Allow custom text input below options"),
      custom_placeholder: z
        .string()
        .optional()
        .describe("Watermark/placeholder hint for the custom input box in the user's language (e.g. 'Örn: 2026-09-01..2026-09-15' or 'Örn: TJ01')"),
    }),
  }),

  time_travel: tool({
    description: "Undo or redo the page and criteria state in time.",
    inputSchema: z.object({
      action: z.enum(["undo", "redo"]).describe("Direction of time travel: undo or redo"),
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
  }),

  recall_fact: tool({
    description: "Recall a stored preference or all memories from agent memory.",
    inputSchema: z.object({
      key: z.string().optional().describe("Memory key to query (empty to list all)"),
    }),
  }),
};

export type StandardAgentTools = typeof STANDARD_AGENT_TOOLS;
