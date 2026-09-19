import {
  defaultRpcTransport,
  InMemoryRPCTransport,
  type RPCTransport,
  type RPCRequest,
  type RPCResponse,
  type RPCMethod,
} from "@my-agent/core";

/**
 * Yula Remote RPC İstemcisi — JSON-RPC 2.0 protokolü üzerinden Web Worker / iframe / sidecar
 * ile çift yönlü güvenli eylem gönderimi sağlar.
 */
export async function sendRpcAction(
  component_id: string,
  action: string,
  payload: Record<string, unknown> = {},
): Promise<RPCResponse> {
  return defaultRpcTransport.send("execute_action", {
    component_id,
    action,
    payload,
  });
}

export async function pingRpc(): Promise<boolean> {
  const res = await defaultRpcTransport.send("ping", {});
  return Boolean(res.success && res.result?.pong);
}

export {
  defaultRpcTransport,
  InMemoryRPCTransport,
  type RPCTransport,
  type RPCRequest,
  type RPCResponse,
  type RPCMethod,
};
