import { ComponentSchema, ActionContract, Tool, tool } from '../../types';
import { agentUiTools } from './standard-tools';

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
