/**
 * Adapter converting Headless UI Components into AgentTool instances
 * Reference: Pi Agent Tool Spec & Yula UI Component Contracts
 */

import type { AgentTool, AgentToolResult } from './agent-loop-types';
import { uiRegistry } from './component-registry';
import { uiEventBus } from './event-bus';
import { executeComponentAction } from './standard-tools';
import { agentMemory } from './memory';
import { sessionManager } from './session-branch';
import { truncateContent } from './truncate';
import { playbookManager } from './playbook';

import { delegatedToolRegistry } from './ui-delegation';

export function createStandardAgentTools(): AgentTool[] {
  return [
    {
      name: 'dispatch_component_action',
      description:
        'Dispatch an action to an active UI component on the screen (criteria_form:<scope>, result_grid:active, app_router, job_history).',
      execute: async (toolCallId, args: any): Promise<AgentToolResult> => {
        const { component_id, action, payload = {} } = args || {};

        if (!component_id || !action) {
          return {
            content: [{ type: 'text', text: 'Error: component_id and action are required.' }],
            details: { valid: false, error: 'Missing component_id or action' },
          };
        }

        // 1. Preflight Validation
        const preflight = uiRegistry.preflightValidate(component_id, action, payload);
        if (!preflight.valid) {
          return {
            content: [{ type: 'text', text: `Preflight validation failed: ${preflight.error}` }],
            details: { valid: false, error: preflight.error },
          };
        }

        // 2. Headless UI Action Execution via Pi Delegated Tool Registry
        const delegatedRes = await delegatedToolRegistry.request('dispatch_component_action', {
          component_id,
          action,
          payload,
          toolCallId,
        });

        const actionResult = delegatedRes.result;

        // 3. Dual-Bound Truncation & Max 10 Records Rule
        let cleanResult = actionResult?.details ?? actionResult?.message ?? actionResult ?? delegatedRes;
        if (Array.isArray(cleanResult) && cleanResult.length > 10) {
          cleanResult = {
            sample: cleanResult.slice(0, 10),
            total_count: cleanResult.length,
            _note: 'Max 10 records returned to prevent context bloat.',
          };
        }

        const serialized = truncateContent(cleanResult).content;

        return {
          content: [{ type: 'text', text: serialized }],
          details: cleanResult,
          terminate: actionResult?.terminate,
        };
      },
    },

    {
      name: 'inspect_ui_state',
      description: 'Inspect the current UI state, active screen components, route, or open table schema.',
      execute: async (_toolCallId, args: any): Promise<AgentToolResult> => {
        const active = uiRegistry.getActiveComponents();
        const recent = uiEventBus.getRecentEvents();
        const targetId = args?.component_id;

        const filtered = targetId ? active.filter((c) => c.id === targetId) : active;
        const details = {
          active_components: filtered.map((c) => ({
            id: c.id,
            capabilities: c.capabilities,
            actions: Object.keys(c.actions || {}),
          })),
          recent_events: recent.slice(-5),
        };

        return {
          content: [{ type: 'text', text: JSON.stringify(details, null, 2) }],
          details,
        };
      },
    },

    {
      name: 'ask_user_choice',
      description:
        'Prompt the user with interactive choice buttons or a clarification question. Suspends the loop until the user makes a choice.',
      execute: async (_toolCallId, args: any): Promise<AgentToolResult> => {
        const { question, options, allow_custom = true, custom_placeholder } = args || {};

        return {
          content: [
            {
              type: 'text',
              text: `[User Decision Required]: ${question}\nOptions: ${JSON.stringify(options)}`,
            },
          ],
          details: { question, options, allow_custom, custom_placeholder },
          terminate: true, // Inline HITL: Döngüyü askıya alır, kullanıcı seçimi beklenir
        };
      },
    },

    {
      name: 'time_travel',
      description: 'Undo or redo the page and criteria state in time.',
      execute: async (_toolCallId, args: any): Promise<AgentToolResult> => {
        const action = args?.action;
        let success = false;
        if (action === 'undo') {
          success = Boolean(sessionManager.undo());
        } else if (action === 'redo') {
          success = Boolean(sessionManager.redo());
        }
        return {
          content: [{ type: 'text', text: success ? `Time travel ${action} succeeded.` : `Cannot ${action} further.` }],
          details: { action, success },
        };
      },
    },

    {
      name: 'remember_fact',
      description: 'Save a user preference, fact, or custom rule into memory.',
      execute: async (_toolCallId, args: any): Promise<AgentToolResult> => {
        const { key, value, scope = 'session', description } = args || {};
        agentMemory.remember(key, value, scope, description);
        return {
          content: [{ type: 'text', text: `Fact "${key}" remembered in ${scope} memory.` }],
          details: { key, scope },
        };
      },
    },

    {
      name: 'recall_fact',
      description: 'Recall a stored preference or all memories from agent memory.',
      execute: async (_toolCallId, args: any): Promise<AgentToolResult> => {
        const { key } = args || {};
        const facts = key ? agentMemory.recall(key) : agentMemory.getAll();
        return {
          content: [{ type: 'text', text: JSON.stringify(facts, null, 2) }],
          details: facts,
        };
      },
    },

    {
      name: 'query_playbook',
      description:
        'Query verified organizational playbooks, operational screen rules, or multi-step workflow recipes from the LLM Wiki.',
      execute: async (_toolCallId, args: any): Promise<AgentToolResult> => {
        const { task, workspace = 'stock' } = args || {};
        if (!task) {
          return {
            content: [{ type: 'text', text: 'Error: task parameter is required.' }],
            details: { valid: false, error: 'Missing task' },
          };
        }
        try {
          const rules = await playbookManager.getScreenRules(task, workspace);
          const recipe = await playbookManager.findRecipe(task, workspace);
          if (rules.length === 0 && !recipe) {
            return {
              content: [
                {
                  type: 'text',
                  text: `No specific verified playbook found for "${task}". Explore dynamically using standard component actions.`,
                },
              ],
              details: { found: false, rules: [], recipe: null },
            };
          }
          const details = {
            found: true,
            screen_rules: rules,
            recipe: recipe ? { title: recipe.title, content: recipe.contentMarkdown } : null,
          };
          return {
            content: [{ type: 'text', text: JSON.stringify(details, null, 2) }],
            details,
          };
        } catch (err: any) {
          return {
            content: [{ type: 'text', text: `Failed to query playbook: ${err?.message || String(err)}` }],
            details: { error: err?.message },
          };
        }
      },
    },

    {
      name: 'propose_playbook_update',
      description:
        'Propose a learned operational rule or multi-step workflow recipe to be saved into the organizational Playbook wiki with user confirmation.',
      execute: async (_toolCallId, args: any): Promise<AgentToolResult> => {
        const { category = 'screen_rule', title, content, target_path, workspace = 'stock' } = args || {};
        try {
          const entry = await playbookManager.proposeEntry({
            category,
            title: title || 'Learned Rule',
            contentMarkdown: content || '',
            targetPath: target_path,
            workspaceId: workspace,
            scope: 'workspace',
            author: 'Yula AI (Learned)',
            proposedBy: 'Yula AI (Agent)',
          });
          return {
            content: [
              {
                type: 'text',
                text: `Önerilen ${category === 'workflow_recipe' ? 'iş akışı reçetesi' : 'ekran kuralı'} "${title}" taslak (draft) olarak yönetici onayına sunuldu. Yönetici onaylayana kadar üretim akışlarına dahil edilmeyecektir.`,
              },
            ],
            details: { status: 'draft', entry },
          };
        } catch (err: any) {
          return {
            content: [{ type: 'text', text: `Failed to record playbook: ${err?.message || String(err)}` }],
            details: { error: err?.message },
          };
        }
      },
    },
  ];
}
