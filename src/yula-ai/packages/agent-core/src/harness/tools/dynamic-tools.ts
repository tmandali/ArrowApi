import { z } from 'zod';
import { tool } from '../../types';
import { uiRegistry } from '../ui-bridge/component-registry';
import { executeComponentAction, ExecuteActionResult } from './standard-tools';

/**
 * Pi Dynamic Tool Loadouts
 * O an ekranda mount edilmiş bileşenlerin kabiliyetlerinden dinamik Vercel AI SDK araçları üretir.
 */
export function buildDynamicToolsFromRegistry(): Record<string, any> {
  const activeComponents = uiRegistry.getActiveComponents();

  if (activeComponents.length === 0) {
    return {};
  }

  const validComponentIds = activeComponents.map((c) => c.id);

  // Dynamic Zod schema based on active components
  return {
    dispatch_component_action: tool({
      description: `Dispatches a type-safe action to active UI components (${validComponentIds.join(', ')}).`,
      inputSchema: z.object({
        component_id: z.string().describe(`Target component ID (Active: ${validComponentIds.join(', ')})`),
        action: z.string().describe('Action name to invoke (e.g. SET_FIELDS, SUBMIT, SORT)'),
        payload: z.record(z.string(), z.any()).optional().describe('Parameters for the action'),
      }),
      execute: async ({ component_id, action, payload }): Promise<ExecuteActionResult> => {
        return executeComponentAction({ component_id, action, payload });
      },
    }),
  };
}
