import { UIAction } from '../../types';
import { uiRegistry } from '../ui-bridge/component-registry';
import { uiEventBus } from '../ui-bridge/event-bus';

export type RPCMethod = 
  | 'execute_action' 
  | 'inspect_state' 
  | 'steer' 
  | 'ping' 
  | 'get_skills';

export interface RPCRequest<T = any> {
  id: string;
  jsonrpc: '2.0';
  method: RPCMethod;
  params: T;
  timestamp: number;
}

export interface RPCResponse<T = any> {
  id: string;
  jsonrpc: '2.0';
  success: boolean;
  result?: T;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
  timestamp: number;
}

export interface RPCTransport {
  send<TReq = any, TRes = any>(method: RPCMethod, params: TReq): Promise<RPCResponse<TRes>>;
  onEvent(handler: (event: any) => void): () => void;
}

/**
 * Tarayıcı içi (In-Memory / Web Worker uyumlu) RPC İstemcisi
 */
export class InMemoryRPCTransport implements RPCTransport {
  private eventHandlers: Set<(event: any) => void> = new Set();

  async send<TReq = any, TRes = any>(method: RPCMethod, params: TReq): Promise<RPCResponse<TRes>> {
    const id = `rpc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const timestamp = Date.now();

    try {
      if (method === 'ping') {
        return {
          id,
          jsonrpc: '2.0',
          success: true,
          result: { pong: true, time: timestamp } as any,
          timestamp,
        };
      }

      if (method === 'execute_action') {
        const action = params as unknown as UIAction;
        const validation = uiRegistry.preflightValidate(
          action.component_id,
          action.action,
          action.payload
        );

        if (!validation.valid) {
          return {
            id,
            jsonrpc: '2.0',
            success: false,
            error: {
              code: -32001,
              message: validation.error || 'Preflight doğrulama hatası',
            },
            timestamp,
          };
        }

        const dispatched = uiEventBus.dispatch(action);
        return {
          id,
          jsonrpc: '2.0',
          success: dispatched.success,
          result: { dispatched, action } as any,
          timestamp,
        };
      }

      if (method === 'inspect_state') {
        return {
          id,
          jsonrpc: '2.0',
          success: true,
          result: {
            active_components: uiRegistry.getActiveComponents(),
            recent_events: uiEventBus.getRecentEvents(),
          } as any,
          timestamp,
        };
      }

      return {
        id,
        jsonrpc: '2.0',
        success: false,
        error: { code: -32601, message: `Bilinmeyen RPC metodu: ${method}` },
        timestamp,
      };
    } catch (err: any) {
      return {
        id,
        jsonrpc: '2.0',
        success: false,
        error: { code: -32603, message: err?.message || 'İç RPC hatası' },
        timestamp,
      };
    }
  }

  onEvent(handler: (event: any) => void): () => void {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }

  broadcast(event: any): void {
    this.eventHandlers.forEach((h) => h(event));
  }
}

export const defaultRpcTransport = new InMemoryRPCTransport();
