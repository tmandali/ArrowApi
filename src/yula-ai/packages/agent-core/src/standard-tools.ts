import { z } from 'zod';
import { uiEventBus } from './event-bus';
import { uiRegistry } from './component-registry';
import { createGate } from './effect-gate';
import { hookPipeline } from './hooks';
import { executionCoordinator } from './execution-queue';
import { telemetryTracker } from './telemetry-metrics';
import { truncateContent } from './truncate';
import { globalMutationLine } from './mutation-line';
import { agentMemory } from './memory';
import { playbookManager } from './playbook';
import { sessionManager } from './session-branch';
import { piEventStream } from './pi-event-stream';
import { ComponentSchema, ActionContract, Tool, tool, TELEMETRY_TOPICS } from './types';
import { i18nManager } from './i18n';
import { classifyDiagnosticError, type DiagnosticVerdict } from './diagnostic-triage';

export interface ExecuteActionParams {
  component_id: string;
  action: string;
  payload?: Record<string, any>;
  toolCallId?: string;
}

export interface UserChoiceOption {
  label: string;
  value?: string;
  description?: string;
  rationale?: string;
  badge?: string;
}

export interface ExecuteActionResult {
  success: boolean;
  message?: string;
  error?: string;
  details?: Record<string, any>;
  diagnostic?: DiagnosticVerdict;
  terminate?: boolean;
}

/**
 * Pi-Style Preflight, Hook Pipeline, Execution Coordinator, MutationLine
 * ve Truncate Token Guard onayından geçen eksiksiz UI aksiyon yürütme motoru.
 */
export async function executeComponentAction({
  component_id,
  action,
  payload,
  toolCallId = `call_${Date.now()}`,
}: ExecuteActionParams): Promise<ExecuteActionResult> {
  const startTime = Date.now();

  // 1. Pi beforeToolCall Hook Pipeline (Human-in-the-Loop & Policy Check)
  const beforeDecision = await hookPipeline.runBeforeHooks({
    toolName: 'dispatch_component_action',
    toolCallId,
    args: { component_id, action, payload },
    activeComponents: uiRegistry.getActiveComponents(),
  });

  if (beforeDecision?.block) {
    uiEventBus.recordTelemetry({
      source: 'dispatch_component_action',
      type: 'ACTION_BLOCKED_BY_HOOK',
      payload: { component_id, action, reason: beforeDecision.block.reason },
    });

    telemetryTracker.recordToolExecution(action, false, Date.now() - startTime);

    return {
      success: false,
      error: `Action blocked: ${beforeDecision.block.reason}`,
      terminate: beforeDecision.block.terminate,
    };
  }

  // Hook tarafından güncellenen argümanlar varsa kullan
  const effectivePayload = beforeDecision?.args?.payload ?? payload;
  const effectiveAction = beforeDecision?.args?.action ?? action;
  const effectiveComponentId = beforeDecision?.args?.component_id ?? component_id;

  // 2. Pi Preflight Validation (Mount, Yetenek ve Zod Payload Şema Kontrolü)
  const preflight = uiRegistry.preflightValidate(effectiveComponentId, effectiveAction, effectivePayload);
  if (!preflight.valid) {
    uiEventBus.recordTelemetry({
      source: 'dispatch_component_action',
      type: 'PREFLIGHT_FAILED',
      payload: { component_id: effectiveComponentId, action: effectiveAction, error: preflight.error },
    });

    telemetryTracker.recordToolExecution(effectiveAction, false, Date.now() - startTime);

    return {
      success: false,
      error: preflight.error,
    };
  }

  // 3. MutationLine (Atomik Durum Zincirleme) & Execution Coordinator & Effect Gate
  const dispatchOutcome = await globalMutationLine.run(async () => {
    return executionCoordinator.coordinateExecution(
      { component_id: effectiveComponentId, action: effectiveAction, payload: effectivePayload },
      async () => {
        const { gate } = createGate();
        return gate.admit(async () => {
          const outcome = uiEventBus.dispatch({
            component_id: effectiveComponentId,
            action: effectiveAction,
            payload: effectivePayload,
          });
          if (outcome.result && typeof (outcome.result as any).then === 'function') {
            try {
              const resolved = await outcome.result;
              outcome.result = resolved;
              if (resolved === false) {
                outcome.success = false;
                outcome.error = `Component "${effectiveComponentId}" rejected the action.`;
              } else if (resolved && typeof resolved === 'object' && resolved.success === false) {
                outcome.success = false;
                outcome.error = resolved.error || outcome.error;
              }
            } catch (err: any) {
              outcome.success = false;
              outcome.error = err?.message || String(err);
            }
          }
          return outcome;
        });
      }
    );
  });

  const isSuccess = dispatchOutcome.success;
  const errorMsg = dispatchOutcome.error;

  // 4. Telemetry Kaydı
  uiEventBus.recordTelemetry({
    source: 'dispatch_component_action',
    type: isSuccess ? 'ACTION_DISPATCHED' : 'ACTION_FAILED',
    payload: { component_id: effectiveComponentId, action: effectiveAction, payload: effectivePayload, error: errorMsg },
  });

  telemetryTracker.recordToolExecution(effectiveAction, isSuccess, Date.now() - startTime);

  if (!isSuccess) {
    const rawErr = errorMsg || `"${effectiveComponentId}" failed to execute action "${effectiveAction}".`;
    const diagnostic = classifyDiagnosticError(rawErr, {
      source: effectiveComponentId,
      payload: effectivePayload,
    });
    return {
      success: false,
      error: rawErr,
      diagnostic,
      details: dispatchOutcome.result,
    };
  }

  // 5. Pi Truncate Token Guard: Büyük veri dönmüşse LLM bağlamı için güvenli şekilde kırp
  let truncatedResult = dispatchOutcome.result;
  if (dispatchOutcome.result && typeof dispatchOutcome.result === 'object') {
    const rawStr = JSON.stringify(dispatchOutcome.result);
    if (rawStr.length > 3000) {
      const truncation = truncateContent(dispatchOutcome.result, { maxLines: 50, maxBytes: 10 * 1024 });
      if (truncation.truncated) {
        truncatedResult = { _truncated_summary: truncation.content };
      }
    }
  }

  const explicitMessage =
    dispatchOutcome.result &&
    typeof dispatchOutcome.result === 'object' &&
    'message' in dispatchOutcome.result &&
    typeof (dispatchOutcome.result as any).message === 'string'
      ? (dispatchOutcome.result as any).message
      : `Action "${effectiveAction}" dispatched to "${effectiveComponentId}".`;

  let initialResult: ExecuteActionResult = {
    success: true,
    message: explicitMessage,
    details: truncatedResult,
  };

  // 6. Pi afterToolCall Hook Pipeline
  const afterPatch = await hookPipeline.runAfterHooks({
    toolName: 'dispatch_component_action',
    toolCallId,
    args: { component_id: effectiveComponentId, action: effectiveAction, payload: effectivePayload },
    result: initialResult,
    isError: !isSuccess,
  });

  if (afterPatch) {
    initialResult = {
      ...initialResult,
      ...(afterPatch.result || {}),
      details: afterPatch.details ?? initialResult.details,
      terminate: afterPatch.terminate,
    };
  }

  return initialResult;
}

export const agentUiTools: Record<string, Tool> = {
  dispatch_component_action: tool({
    description: 'Dispatch an action to an active UI component on the screen (criteria form, result grid, app router, job history).',
    inputSchema: z.object({
      component_id: z.string().describe('Target component identifier (e.g. criteria_form:scope, result_grid:active, app_router, job_history)'),
      action: z.string().describe('Action to trigger (e.g. SET_FIELDS, SUBMIT, SORT, NAVIGATE)'),
      payload: z.record(z.string(), z.any()).optional().describe('Action parameters and criteria'),
    }),
    execute: async ({ component_id, action, payload }) => {
      return executeComponentAction({ component_id, action, payload });
    },
  }),

  inspect_ui_state: tool({
    description: 'Inspect active screen components, capabilities, or targeted UI telemetry events.',
    inputSchema: z.object({
      component_id: z.string().optional().describe('Target component ID to inspect (if omitted, all active components return)'),
      topic: z
        .enum(['jobs', 'data', 'form', 'navigation', 'system'])
        .optional()
        .describe(
          `Filter telemetry events by topic: ${Object.values(TELEMETRY_TOPICS)
            .map((t) => `"${t.key}" (${t.description})`)
            .join('; ')}`
        ),
      source: z.string().optional().describe('Filter telemetry events by source component identifier'),
      event_type: z.string().optional().describe('Filter telemetry events by event type (e.g. ROW_SELECTED, REPORT_COMPLETED)'),
      correlation_id: z.string().optional().describe('Filter events by causality correlation ID (e.g. jobId)'),
      min_severity: z.enum(['info', 'warn', 'critical']).optional().describe('Filter events by minimum severity level'),
      limit: z.number().optional().describe('Maximum number of events to return (default: 10)'),
    }),
    execute: async ({ component_id, topic, source, event_type, correlation_id, min_severity, limit }) => {
      const filterOpts = { topic, source, type: event_type, correlationId: correlation_id, minSeverity: min_severity, limit };
      if (component_id) {
        const comp = uiRegistry.get(component_id);
        if (!comp) {
          return { success: false, error: `Component "${component_id}" is not currently mounted on screen.` };
        }
        return {
          success: true,
          component: comp,
          recent_events: uiEventBus.getRecentEvents({ ...filterOpts, source: component_id }),
        };
      }
      return {
        success: true,
        active_components: uiRegistry.getActiveComponents(),
        recent_events: uiEventBus.getRecentEvents(filterOpts),
        available_topics: TELEMETRY_TOPICS,
      };
    },
  }),

  remember_fact: tool({
    description: 'Save a user preference, fact, or custom rule into agent memory.',
    inputSchema: z.object({
      key: z.string().describe('Memory key (e.g. preferred_store, user_role, export_format)'),
      value: z.any().describe('Value to store'),
      scope: z.enum(['session', 'persistent']).default('session').describe('Memory scope: session (current session only) or persistent (persists across sessions)'),
      description: z.string().optional().describe('Brief description of what this fact represents'),
    }),
    execute: async ({ key, value, scope, description }) => {
      agentMemory.remember(key, value, scope, description);
      return {
        success: true,
        message: `Fact "${key}" successfully saved to [${scope}] memory.`,
        key,
        value,
        scope,
      };
    },
  }),

  recall_fact: tool({
    description: 'Recall a stored memory fact or query all records from memory.',
    inputSchema: z.object({
      key: z.string().optional().describe('Memory key to query (if omitted, returns all memories)'),
    }),
    execute: async ({ key }) => {
      if (key) {
        const val = agentMemory.recall(key);
        if (val === undefined) {
          return { success: false, error: `No memory record found for key "${key}".` };
        }
        return { success: true, key, value: val };
      }
      return {
        success: true,
        memories: agentMemory.getAll(),
      };
    },
  }),

  forget_fact: tool({
    description: 'Delete a stored memory record by its key.',
    inputSchema: z.object({
      key: z.string().describe('Memory key to delete'),
    }),
    execute: async ({ key }) => {
      const removed = agentMemory.forget(key);
      if (!removed) {
        return {
          success: false,
          error: `Fact "${key}" not found in memory.`,
          key,
        };
      }
      return {
        success: true,
        message: i18nManager.getDictionary().status.factDeleted(key),
        key,
      };
    },
  }),

  query_playbook: tool({
    description: 'Query verified organizational playbooks, operational screen rules, or multi-step workflow recipes from the LLM Wiki.',
    inputSchema: z.object({
      task: z.string().describe('The task, topic, or screen path to search playbooks for (e.g. "stok mutabakatı", "fire analizi", "/stock/stock-balance")'),
      workspace: z.string().optional().default('stock').describe('Workspace ID (defaults to "stock")'),
    }),
    execute: async ({ task, workspace = 'stock' }) => {
      const rules = await playbookManager.getScreenRules(task, workspace);
      const recipe = await playbookManager.findRecipe(task, workspace);
      if (rules.length === 0 && !recipe) {
        return {
          success: true,
          found: false,
          message: `No specific verified playbook found for "${task}". Explore dynamically using standard component actions.`,
        };
      }
      return {
        success: true,
        found: true,
        screen_rules: rules,
        recipe: recipe ? { title: recipe.title, content: recipe.contentMarkdown } : undefined,
      };
    },
  }),

  propose_playbook_update: tool({
    description: 'Propose a learned operational rule or multi-step workflow recipe to be saved into the organizational Playbook wiki with user confirmation.',
    inputSchema: z.object({
      category: z.enum(['screen_rule', 'workflow_recipe']).describe('Type of playbook entry: screen_rule (e.g. filter restriction) or workflow_recipe (multi-step recipe)'),
      title: z.string().describe('Short descriptive title for this rule or recipe'),
      content: z.string().describe('The markdown content of the rule or recipe'),
      target_path: z.string().optional().describe('Target screen route (e.g. /stock/stock-balance) if this is a screen rule'),
      workspace: z.string().optional().default('stock').describe('Target workspace (defaults to "stock")'),
    }),
    execute: async ({ category, title, content, target_path, workspace = 'stock' }) => {
      const question = category === 'screen_rule'
        ? `📋 Yeni Ekran Kuralı: "${title}"\nBu kuralı Playbook'a kalıcı olarak kaydetmek istiyor musunuz?`
        : `🚀 Yeni İş Akışı Reçetesi: "${title}"\nBu reçeteyi Playbook'a kalıcı olarak kaydetmek istiyor musunuz?`;

      // Trigger inline HITL prompt
      piEventStream.emit({
        type: 'user_choice_prompt',
        question,
        options: [
          { label: "Evet, Playbook'a Kaydet", value: 'confirm_save' },
          { label: 'Hayır, Sadece Bu Seferlik', value: 'skip_save' },
        ],
        allow_custom: false,
      } as any);

      uiEventBus.recordTelemetry({
        source: 'propose_playbook_update',
        type: 'PLAYBOOK_PROPOSAL',
        payload: { category, title, content, target_path, workspace },
      });

      return {
        success: true,
        status: 'waiting_user_selection',
        message: `Proposed ${category} "${title}". Waiting for user confirmation.`,
        proposal: { category, title, content, target_path, workspace },
      };
    },
  }),

  ask_user_choice: tool({
    description: 'Prompt the user with interactive choice buttons or a clarification question with predefined options and optional freeform input.',
    inputSchema: z.object({
      question: z.string().describe('Question or decision prompt to present to the user'),
      options: z
        .array(
          z.union([
            z.string(),
            z.object({
              label: z.string().describe('Option button label / title (concise single-line)'),
              value: z.string().optional().describe('Returned value when selected (defaults to label)'),
              description: z.string().optional().describe('Brief 1-phrase explanation of what will happen if selected'),
              rationale: z.string().optional().describe('Deprecated: Keep options concise without verbose rationales'),
              badge: z.string().optional().describe('Optional badge tag, e.g. Önerilen, Standart'),
            }),
          ]),
        )
        .min(1)
        .describe('List of selectable options (concise single-line format preferred)'),
      allow_custom: z
        .boolean()
        .optional()
        .default(true)
        .describe('Whether the user is allowed to type freeform text outside the options'),
    }),
    execute: async ({
      question,
      options,
      allow_custom = true,
    }: {
      question: string;
      options: Array<string | { label: string; value?: string; description?: string; rationale?: string; badge?: string }>;
      allow_custom?: boolean;
    }) => {
      const normalizedOptions: UserChoiceOption[] = options.map((opt) =>
        typeof opt === 'string'
          ? { label: opt, value: opt }
          : {
              label: opt.label,
              value: opt.value || opt.label,
              description: opt.description,
              rationale: opt.rationale,
              badge: opt.badge,
            },
      );

      // 1. Pi EventStream ve Telemetri Eventi (Hibrit Yayın)
      piEventStream.emit({
        type: 'user_choice_prompt',
        question,
        options: normalizedOptions,
        allow_custom,
      } as any);

      uiEventBus.recordTelemetry({
        source: 'ask_user_choice',
        type: 'USER_CHOICE_PROMPT',
        payload: { question, options: normalizedOptions, allow_custom },
      });

      return {
        success: true,
        suspend: true,
        status: 'waiting_user_selection',
        message: i18nManager.getDictionary().status.waitingUserSelection(question, normalizedOptions.length),
        question,
        options: normalizedOptions,
        allow_custom,
      };
    },
  }),
};

export { createAgentToolsForServer } from './server-tools';

