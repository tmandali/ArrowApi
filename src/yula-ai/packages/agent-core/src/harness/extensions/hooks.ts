import {
  BeforeToolCallContext,
  BeforeToolCallResult,
  BeforeToolCallHook,
  AfterToolCallContext,
  AfterToolCallResult,
  AfterToolCallHook,
} from '../../types';

/**
 * Pi-Style Tool Execution Hook Pipeline
 * Reference: earendil-works/pi/packages/agent/src/harness/execution/tools.ts
 */
export class HookPipeline {
  private beforeHooks: BeforeToolCallHook[] = [];
  private afterHooks: AfterToolCallHook[] = [];

  beforeToolCall(hook: BeforeToolCallHook): () => void {
    this.beforeHooks.push(hook);
    return () => {
      this.beforeHooks = this.beforeHooks.filter((h) => h !== hook);
    };
  }

  afterToolCall(hook: AfterToolCallHook): () => void {
    this.afterHooks.push(hook);
    return () => {
      this.afterHooks = this.afterHooks.filter((h) => h !== hook);
    };
  }

  async runBeforeHooks(context: BeforeToolCallContext): Promise<BeforeToolCallResult | null> {
    let currentArgs = context.args;

    for (const hook of this.beforeHooks) {
      try {
        const result = await hook({ ...context, args: currentArgs });
        if (!result) continue;

        // Bloke edilirse anında durdur
        if (result.block) {
          return {
            block: result.block,
            args: currentArgs,
          };
        }

        // Argümanlar mutate/sanitize edildiyse güncelle
        if (result.args) {
          currentArgs = result.args;
        }
      } catch (err: any) {
        return {
          block: { reason: `Hook execution error: ${err?.message || String(err)}`, terminate: true },
        };
      }
    }

    return { args: currentArgs };
  }

  async runAfterHooks(context: AfterToolCallContext): Promise<AfterToolCallResult | null> {
    if (this.afterHooks.length === 0) {
      return null;
    }
    let currentResult = context.result;
    let shouldTerminate = false;
    let isError = context.isError;
    let details: Record<string, any> = { ...(context.result?.details || {}) };

    for (const hook of this.afterHooks) {
      try {
        const patch = await hook({ ...context, result: currentResult, isError });
        if (!patch) continue;

        if (patch.result !== undefined) currentResult = patch.result;
        if (patch.terminate !== undefined) shouldTerminate = patch.terminate;
        if (patch.isError !== undefined) isError = patch.isError;
        if (patch.details) details = { ...details, ...patch.details };
      } catch (err) {
        console.error('[HookPipeline] afterToolCall error:', err);
      }
    }

    return {
      result: currentResult,
      isError,
      terminate: shouldTerminate,
      details,
    };
  }

  clear(): void {
    this.beforeHooks = [];
    this.afterHooks = [];
  }
}

export const hookPipeline = new HookPipeline();
