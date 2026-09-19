import { executeComponentAction } from "@my-agent/core";
import { executeDispatchComponentAction } from "./client-tools/dispatch-bridge";

export { resetGridCustomView } from "./client-tools/dataset";
export { executeDispatchComponentAction } from "./client-tools/dispatch-bridge";

/**
 * İstemci tarafı araç yürütücüsü — tüm eylemleri doğrudan @my-agent/core
 * ve dispatch-bridge mekanizmasına yönlendirir.
 */
export async function executeClientTool(
  toolName: string,
  input: unknown,
): Promise<unknown> {
  const args = (input ?? {}) as Record<string, unknown>;
  if (toolName === "dispatch_component_action") {
    const res = await executeComponentAction({
      component_id: String(args.component_id ?? ""),
      action: String(args.action ?? ""),
      payload: (args.payload as Record<string, unknown>) ?? {},
    });
    if (!res.success) {
      return executeDispatchComponentAction({
        component_id: String(args.component_id ?? ""),
        action: String(args.action ?? ""),
        payload: (args.payload as Record<string, unknown>) ?? {},
      });
    }
    return (res as any).result ?? res.message ?? res;
  }
  return executeDispatchComponentAction({
    component_id: toolName,
    action: "RUN",
    payload: args,
  });
}
