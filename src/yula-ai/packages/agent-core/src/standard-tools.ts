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
      error: `Eylem engellendi: ${beforeDecision.block.reason}`,
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
                outcome.error = `Bileşen "${effectiveComponentId}" eylemi reddetti.`;
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
      error: errorMsg || `"${effectiveComponentId}" bileşeni "${effectiveAction}" eylemini yürütemedi.`,
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

  let initialResult: ExecuteActionResult = {
    success: true,
    message: `"${effectiveComponentId}" bileşenine "${effectiveAction}" komutu iletildi.`,
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
    description: 'Ekranda aktif olan bir UI bileşenine (form, tablo vb.) aksiyon gönderir.',
    inputSchema: z.object({
      component_id: z.string().describe('Hedef bileşenin benzersiz kimliği'),
      action: z.string().describe('Tetiklenecek aksiyon (örn: SET_FIELDS, SUBMIT, SORT)'),
      payload: z.record(z.string(), z.any()).optional().describe('Aksiyona ait parametreler'),
    }),
    execute: async ({ component_id, action, payload }) => {
      return executeComponentAction({ component_id, action, payload });
    },
  }),

  inspect_ui_state: tool({
    description: 'Ekranda aktif olan bir bileşenin yeteneklerini veya tüm aktif UI bileşenlerinin anlık durumunu inceler.',
    inputSchema: z.object({
      component_id: z.string().optional().describe('İncelenmek istenen bileşenin IDsi (boş bırakılırsa tüm aktif bileşenler döner)'),
    }),
    execute: async ({ component_id }) => {
      if (component_id) {
        const comp = uiRegistry.get(component_id);
        if (!comp) {
          return { success: false, error: `Bileşen "${component_id}" şu an ekranda mount edilmemiş.` };
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
    description: 'Kullanıcının kalıcı tercihlerini veya konuşma boyunca hatırlanması gereken bir gerçeği hafızaya kaydeder.',
    inputSchema: z.object({
      key: z.string().describe('Hafıza anahtarı (örn: preferred_store, user_role, export_format)'),
      value: z.any().describe('Kaydedilecek değer'),
      scope: z.enum(['session', 'persistent']).default('session').describe('Hafıza kapsamı: session (sadece bu oturum) veya persistent (kalıcı)'),
      description: z.string().optional().describe('Bu bilginin ne olduğuna dair kısa açıklama'),
    }),
    execute: async ({ key, value, scope, description }) => {
      agentMemory.remember(key, value, scope, description);
      return {
        success: true,
        message: `"${key}" bilgisi [${scope}] hafızasına başarıyla kaydedildi.`,
        key,
        value,
        scope,
      };
    },
  }),

  recall_fact: tool({
    description: 'Hafızada saklanan bir bilgiyi veya tüm hafıza kayıtlarını sorgular.',
    inputSchema: z.object({
      key: z.string().optional().describe('Sorgulanacak hafıza anahtarı (boş bırakılırsa tüm hafıza döner)'),
    }),
    execute: async ({ key }) => {
      if (key) {
        const val = agentMemory.recall(key);
        if (val === undefined) {
          return { success: false, error: `Hafızada "${key}" anahtarına ait bir kayıt bulunamadı.` };
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
    description: 'Hafızada kayıtlı bir bilgiyi anahtarına göre siler.',
    inputSchema: z.object({
      key: z.string().describe('Silinecek bilginin anahtarı'),
    }),
    execute: async ({ key }) => {
      const removed = agentMemory.forget(key);
      if (!removed) {
        return {
          success: false,
          error: `"${key}" bilgisi hafızada bulunamadı.`,
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

  time_travel: tool({
    description: 'Sayfa durumunu zamanda geri alır (undo) veya ileri sarar (redo).',
    inputSchema: z.object({
      action: z.enum(['undo', 'redo']).describe('Zaman yolculuğu yönü: undo (geri al) veya redo (ileri al)'),
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
    description: 'Kullanıcıya netleştirmek, karar vermesini sağlamak veya seçenekler arasından tercih yaptırmak için etkileşimli butonlar sunar.',
    inputSchema: z.object({
      question: z.string().describe('Kullanıcıya yöneltilecek soru veya karar başlığı'),
      options: z
        .array(
          z.union([
            z.string(),
            z.object({
              label: z.string().describe('Seçenek butonunda görünecek başlık'),
              value: z.string().optional().describe('Seçildiğinde dönecek değer (boşsa label kullanılır)'),
              description: z.string().optional().describe('Seçenek hakkında ek açıklama veya detay'),
            }),
          ]),
        )
        .min(1)
        .describe('Kullanıcıya sunulacak tıklanabilir seçenekler listesi (en az 1 adet)'),
      allow_custom: z
        .boolean()
        .optional()
        .default(true)
        .describe('Kullanıcının seçenekler dışında serbest metin girmesine izin verilsin mi?'),
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
        // 1. Sunucu tarafı Preflight denetimi
        const comp = activeComps.find((c) => c.id === component_id);
        if (!comp) {
          return {
            success: false,
            error: `Preflight Hatası: Bileşen "${component_id}" şu an ekranda mount edilmemiş.`,
          };
        }
        const caps = comp.capabilities || Object.keys(comp.actions || {});
        if (!caps.includes(action)) {
          return {
            success: false,
            error: `Preflight Hatası: Bileşen "${component_id}", "${action}" aksiyonunu desteklemiyor. Desteklenenler: ${caps.join(', ')}`,
          };
        }

        // 2. Sunucu Tarafı Zod Şema Doğrulaması (actions tanımlıysa)
        const schema =
          options?.actions?.[component_id]?.[action]?.schema ||
          comp.actions?.[action]?.schema;
        if (schema && typeof schema.safeParse === 'function') {
          const parseResult = schema.safeParse(payload || {});
          if (!parseResult.success) {
            const formattedError = parseResult.error?.errors
              ? parseResult.error.errors.map((e: any) => `${e.path.join('.') || 'root'}: ${e.message}`).join('; ')
              : parseResult.error?.message || 'Geçersiz parametreler.';
            return {
              success: false,
              error: `Zod Validasyon Hatası (${component_id}.${action}): ${formattedError}`,
            };
          }
        }

        // 3. Opsiyonel özel validasyon kancası
        if (options?.onValidateAction) {
          const valRes = options.onValidateAction({ component_id, action, payload });
          if (valRes && !valRes.valid) {
            return {
              success: false,
              error: valRes.error || 'Validasyon hatası.',
            };
          }
        }

        return {
          success: true,
          message: `Aksiyon '${action}' bileşen '${component_id}' için başarıyla iletildi.`,
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
          if (!comp) return { success: false, error: `Bileşen "${component_id}" ekranda yok.` };
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

