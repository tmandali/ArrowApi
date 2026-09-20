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
import { ComponentSchema, ActionContract, Tool, tool } from './types';
import { i18nManager } from './i18n';

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
}

export interface ExecuteActionResult {
  success: boolean;
  message?: string;
  error?: string;
  details?: Record<string, any>;
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
    return {
      success: false,
      error: errorMsg || `"${effectiveComponentId}" failed to execute action "${effectiveAction}".`,
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
    description: 'Inspect active screen components, capabilities, or current UI state snapshot.',
    inputSchema: z.object({
      component_id: z.string().optional().describe('Target component ID to inspect (if omitted, all active components return)'),
    }),
    execute: async ({ component_id }) => {
      if (component_id) {
        const comp = uiRegistry.get(component_id);
        if (!comp) {
          return { success: false, error: `Component "${component_id}" is not currently mounted on screen.` };
        }
        return { success: true, component: comp };
      }
      return {
        success: true,
        active_components: uiRegistry.getActiveComponents(),
        recent_events: uiEventBus.getRecentEvents(),
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

  time_travel: tool({
    description: 'Undo or redo the page and criteria state in time.',
    inputSchema: z.object({
      action: z.enum(['undo', 'redo']).describe('Time travel direction: undo or redo'),
    }),
    execute: async ({ action }) => {
      const dict = i18nManager.getDictionary();
      if (action === 'undo') {
        const cp = sessionManager.undo();
        if (!cp) return { success: false, error: dict.errors.undoUnavailable };
        return { success: true, message: dict.status.undoSuccess(cp.label), checkpoint: cp };
      } else {
        const cp = sessionManager.redo();
        if (!cp) return { success: false, error: dict.errors.redoUnavailable };
        return { success: true, message: dict.status.redoSuccess(cp.label), checkpoint: cp };
      }
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
              label: z.string().describe('Option button label'),
              value: z.string().optional().describe('Returned value when selected (defaults to label)'),
              description: z.string().optional().describe('Additional detail or note for this option'),
            }),
          ]),
        )
        .min(1)
        .describe('List of selectable options (at least 1 option)'),
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
      options: Array<string | { label: string; value?: string; description?: string }>;
      allow_custom?: boolean;
    }) => {
      const normalizedOptions: UserChoiceOption[] = options.map((opt) =>
        typeof opt === 'string'
          ? { label: opt, value: opt }
          : { label: opt.label, value: opt.value || opt.label, description: opt.description },
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
        status: 'waiting_user_selection',
        message: i18nManager.getDictionary().status.waitingUserSelection(question, normalizedOptions.length),
        question,
        options: normalizedOptions,
        allow_custom,
      };
    },
  }),
};

/**
 * Backend API uç noktaları (Next.js route handler, Express, Vite middleware vb.) için
 * gelen UI context snapshot'ı ile ön doğrulama yapan Vercel AI SDK araç seti üretir.
 * Bu sayede server tarafında araçları tekrar tekrar elle tanımlamak gerekmez (DRY).
 */
export function createAgentToolsForServer(
  uiContext?: {
    active_components?: Array<ComponentSchema>;
    recent_events?: any[];
    route?: string;
  },
  options?: {
    onValidateAction?: (params: { component_id: string; action: string; payload?: any }) => { valid: boolean; error?: string } | void;
    actions?: Record<string, Record<string, ActionContract | { schema?: any }>>;
  }
): Record<string, Tool> {
  const activeComps = uiContext?.active_components || [];
  const recentEvents = uiContext?.recent_events || [];

  return {
    ...agentUiTools,
    dispatch_component_action: tool({
      description: agentUiTools.dispatch_component_action.description,
      inputSchema: agentUiTools.dispatch_component_action.inputSchema,
      execute: async ({ component_id, action, payload }) => {
        // 1. Server-side Preflight check
        const comp = activeComps.find((c) => c.id === component_id);
        if (!comp) {
          return {
            success: false,
            error: `Preflight Error: Component "${component_id}" is not currently mounted on screen.`,
          };
        }
        const caps = comp.capabilities || Object.keys(comp.actions || {});
        if (!caps.includes(action)) {
          return {
            success: false,
            error: `Preflight Error: Component "${component_id}" does not support action "${action}". Supported: ${caps.join(', ')}`,
          };
        }

        // 2. Server-side Zod schema validation (if actions defined)
        const schema =
          options?.actions?.[component_id]?.[action]?.schema ||
          comp.actions?.[action]?.schema;
        if (schema && typeof schema.safeParse === 'function') {
          const parseResult = schema.safeParse(payload || {});
          if (!parseResult.success) {
            const issues = (parseResult.error as any)?.issues || (parseResult.error as any)?.errors;
            const formattedError = Array.isArray(issues) && issues.length > 0
              ? issues.map((e: any) => `${e.path?.join?.('.') || 'root'}: ${e.message}`).join('; ')
              : parseResult.error?.message || 'Invalid parameters.';
            return {
              success: false,
              error: `Zod Validation Error (${component_id}.${action}): ${formattedError}`,
            };
          }
        }

        // 3. Optional custom validation hook
        if (options?.onValidateAction) {
          const valRes = options.onValidateAction({ component_id, action, payload });
          if (valRes && !valRes.valid) {
            return {
              success: false,
              error: valRes.error || 'Validation error.',
            };
          }
        }

        return {
          success: true,
          message: `Action '${action}' successfully dispatched to component '${component_id}'.`,
          component_id,
          action,
          payload,
        };
      },
    }),
    inspect_ui_state: tool({
      description: agentUiTools.inspect_ui_state.description,
      inputSchema: agentUiTools.inspect_ui_state.inputSchema,
      execute: async ({ component_id }) => {
        if (component_id) {
          const comp = activeComps.find((c) => c.id === component_id);
          if (!comp) return { success: false, error: `Component "${component_id}" is not mounted on screen.` };
          return { success: true, component: comp };
        }
        return {
          success: true,
          active_components: activeComps,
          recent_events: recentEvents,
        };
      },
    }),
  };
}

