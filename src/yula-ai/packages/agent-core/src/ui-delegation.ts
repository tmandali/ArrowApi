/**
 * UI Tool Delegation Protocol (Reference Pi ExtensionUI Pattern)
 *
 * Ajan döngüsünün (agentLoop) UI ile etkileşime girmesi gerektiğinde (form doldurma,
 * inline seçim kartları, navigasyon) tüm konuşma transkriptini ağda taşımak yerine,
 * tekil ve hafif bir delegasyon isteği (DelegatedUIRequest) üretir ve React
 * sunum katmanından anında yanıt (DelegatedUIResponse) alır.
 */

import { executeComponentAction } from './standard-tools';
import { uiRegistry } from './component-registry';
import { uiEventBus } from './event-bus';
import { piEventStream } from './pi-event-stream';

export interface DelegatedUIRequest<TPayload = any> {
  id: string;
  method: 'dispatch_component_action' | 'ask_user_choice' | 'inspect_ui_state' | string;
  payload: TPayload;
  timeoutMs?: number;
}

export interface DelegatedUIResponse<TResult = any> {
  id: string;
  success: boolean;
  result?: TResult;
  error?: string;
  cancelled?: boolean;
}

export type DelegatedUIHandler = (
  request: DelegatedUIRequest,
) => Promise<DelegatedUIResponse | void> | DelegatedUIResponse | void;

export class DelegatedToolRegistry {
  private pendingRequests = new Map<
    string,
    {
      resolve: (res: DelegatedUIResponse) => void;
      reject: (err: Error) => void;
      timeoutId?: ReturnType<typeof setTimeout>;
    }
  >();

  private customHandler?: DelegatedUIHandler;

  /**
   * İstemci (React Presentation / RPC Client) delegasyon işleyicisini bağlar.
   */
  registerHandler(handler: DelegatedUIHandler): () => void {
    this.customHandler = handler;
    return () => {
      if (this.customHandler === handler) {
        this.customHandler = undefined;
      }
    };
  }

  /**
   * Ajan tarafından tetiklenen UI eylemini icra eder veya istemciye delege eder.
   */
  async request<TPayload = any, TResult = any>(
    method: string,
    payload: TPayload,
    options?: { timeoutMs?: number; signal?: AbortSignal },
  ): Promise<DelegatedUIResponse<TResult>> {
    const id = `ui_req_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const request: DelegatedUIRequest<TPayload> = {
      id,
      method,
      payload,
      timeoutMs: options?.timeoutMs,
    };

    // 1. Özel bir handler (React / RPC client) kayıtlıysa önce ona sor
    if (this.customHandler) {
      return new Promise<DelegatedUIResponse<TResult>>((resolve, reject) => {
        let timeoutId: ReturnType<typeof setTimeout> | undefined;

        const cleanup = () => {
          if (timeoutId) clearTimeout(timeoutId);
          options?.signal?.removeEventListener('abort', onAbort);
          this.pendingRequests.delete(id);
        };

        const onAbort = () => {
          cleanup();
          resolve({ id, success: false, cancelled: true, error: 'UI Request aborted' });
        };

        if (options?.signal) {
          if (options.signal.aborted) {
            return resolve({ id, success: false, cancelled: true, error: 'Aborted' });
          }
          options.signal.addEventListener('abort', onAbort, { once: true });
        }

        if (options?.timeoutMs && options.timeoutMs > 0) {
          timeoutId = setTimeout(() => {
            cleanup();
            resolve({ id, success: false, error: `UI Request timed out after ${options.timeoutMs}ms` });
          }, options.timeoutMs);
        }

        this.pendingRequests.set(id, { resolve, reject, timeoutId });

        // Handler'a fırlat
        try {
          const directResult = this.customHandler!(request);
          if (directResult && typeof (directResult as any).then === 'function') {
            (directResult as Promise<DelegatedUIResponse | void>).then((asyncRes) => {
              if (asyncRes && this.pendingRequests.has(id)) {
                this.respond(asyncRes);
              }
            }).catch((err) => {
              cleanup();
              reject(err);
            });
          } else if (directResult) {
            this.respond(directResult as DelegatedUIResponse);
          }
        } catch (err: any) {
          cleanup();
          reject(err);
        }
      });
    }

    // 2. Özel handler yoksa yerel (In-Memory) doğrudan icra et
    return this.executeLocally<TPayload, TResult>(request);
  }

  /**
   * İstemciden dönen yanıtı bekleyen Promise ile eşleştirir.
   */
  respond(response: DelegatedUIResponse): boolean {
    const entry = this.pendingRequests.get(response.id);
    if (!entry) return false;

    if (entry.timeoutId) clearTimeout(entry.timeoutId);
    this.pendingRequests.delete(response.id);
    entry.resolve(response);
    return true;
  }

  /**
   * Bekleyen tüm istekleri iptal eder (örneğin abort sırasında).
   */
  cancelAll(reason = 'Cancelled'): void {
    for (const [id, entry] of this.pendingRequests.entries()) {
      if (entry.timeoutId) clearTimeout(entry.timeoutId);
      entry.resolve({ id, success: false, cancelled: true, error: reason });
    }
    this.pendingRequests.clear();
  }

  getPendingCount(): number {
    return this.pendingRequests.size;
  }

  private async executeLocally<TPayload, TResult>(
    req: DelegatedUIRequest<TPayload>,
  ): Promise<DelegatedUIResponse<TResult>> {
    try {
      if (req.method === 'dispatch_component_action') {
        const p = req.payload as any;
        const res = await executeComponentAction({
          component_id: String(p?.component_id ?? ''),
          action: String(p?.action ?? ''),
          payload: p?.payload ?? {},
        });
        return {
          id: req.id,
          success: res.success,
          result: res as any,
          error: res.error,
        };
      }

      if (req.method === 'inspect_ui_state') {
        return {
          id: req.id,
          success: true,
          result: {
            active_components: uiRegistry.getActiveComponents(),
            recent_events: uiEventBus.getRecentEvents(),
          } as any,
        };
      }

      if (req.method === 'ask_user_choice') {
        // Yerel modda ask_user_choice: piEventStream'e bildirir ve askıya alır
        piEventStream.emit({
          type: 'tool_execution_start',
          toolCallId: req.id,
          toolName: 'ask_user_choice',
          args: req.payload,
        });
        return {
          id: req.id,
          success: true,
          result: { suspended: true, prompt: req.payload } as any,
        };
      }

      return {
        id: req.id,
        success: false,
        error: `Bilinmeyen UI delegasyon metodu: ${req.method}`,
      };
    } catch (err: any) {
      return {
        id: req.id,
        success: false,
        error: err?.message || 'Yerel UI delegasyon hatası',
      };
    }
  }
}

export const delegatedToolRegistry = new DelegatedToolRegistry();
