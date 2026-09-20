/**
 * Yula Step Router & Tool Pruner
 * Vercel AI SDK `prepareStep` için akıllı araç yönlendirme ve dinamik budama motoru.
 */

import { pruneMessages } from "ai";
import type { YulaScreenPhase } from "./yula-agent-prompt";

export interface StepRouterContext {
  phase?: YulaScreenPhase;
  stepNumber: number;
  toolNames: string[];
  hasImageInMessages?: boolean;
  messages: unknown[];
  compactionBudget?: number;
}

export interface StepRouterResult {
  activeTools: string[];
  compactedMessages?: any[];
}

/**
 * Belirtilen mesaj listesinin tahmini token büyüklüğünü hesaplar (karakter / 4).
 */
export function estimateStepTokens(messages: unknown): number {
  try {
    return Math.ceil(JSON.stringify(messages).length / 4);
  } catch {
    return 0;
  }
}

/**
 * Adım ve ekran fazına göre aktif araç listesini akıllıca belirler.
 */
export function resolveActiveToolsForStep(context: StepRouterContext): string[] {
  const { hasImageInMessages, toolNames } = context;

  // Görsel içeren mesajlarda modelin araç çağırması engellenir (Vision grounding kuralı).
  if (hasImageInMessages) {
    return [];
  }

  // Temel araç seti hazır
  return [...toolNames];
}

/**
 * prepareStep çağrısında token bütçesini denetler ve aktif araçları filtreler.
 */
export function prepareStepRouting(context: StepRouterContext): StepRouterResult {
  const activeTools = resolveActiveToolsForStep(context);
  const budget = context.compactionBudget && context.compactionBudget > 0
    ? context.compactionBudget
    : 50_000;

  const currentTokens = estimateStepTokens(context.messages);

  if (currentTokens <= budget) {
    return { activeTools };
  }

  const compacted = pruneMessages({
    messages: context.messages as any,
    reasoning: "all",
    toolCalls: "before-last-3-messages",
    emptyMessages: "remove",
  });

  return {
    activeTools,
    compactedMessages: compacted,
  };
}
