import type { YulaMessage } from "@/app/api/agent/chat/route";
import type { WorkedStepItem } from "./yula-worked-steps";
import { isTextPart, isReasoningPart, getMessageText } from "@my-agent/core";

export interface TurnJsonDump {
  timestamp: string;
  durationSec: number | string;
  telemetry: {
    totalTokens: number;
    inputTokens: number;
    outputTokens: number;
    cost: string | null;
    contextUsage?: {
      percent: number;
      tokens: number;
      contextWindow: number;
    };
  };
  userMessage?: {
    id?: string;
    text: string;
  };
  assistantMessage?: {
    id?: string;
    text: string;
    reasoning?: string;
    model?: string;
    provider?: string;
  };
  steps: Array<{
    id: string;
    kind: string;
    label: string;
    subLabel?: string;
    isError?: boolean;
    durationSec?: number;
    stepIndex?: number;
    tool?: string;
    input?: unknown;
    output?: unknown;
    detailText?: string;
  }>;
  rawMessage?: YulaMessage;
}

export interface BuildFullCopyTextParams {
  timeLabel: number | string;
  totalTokens: number;
  inTokens: number;
  outTokens: number;
  costFormatted: string | null;
  contextUsage?: { percent: number; tokens: number; contextWindow: number };
  steps: WorkedStepItem[];
  userMessage?: YulaMessage;
  message?: YulaMessage;
  workedForText?: string;
  telemetryTokensLabel?: string;
  telemetryInputLabel?: string;
  telemetryOutputLabel?: string;
  telemetryCostLabel?: string;
  telemetryContextLabel?: string;
}

/**
 * Turun eksiksiz durumunu (telemetri, kullanıcı sorusu, asistan yanıtı,
 * ReAct adımları, araç girdileri ve ham mesaj) formatlanmış JSON dump olarak üretir.
 */
export function buildFullCopyText({
  timeLabel,
  totalTokens,
  inTokens,
  outTokens,
  costFormatted,
  contextUsage,
  steps,
  userMessage,
  message,
}: BuildFullCopyTextParams): string {
  const userText = userMessage ? getMessageText(userMessage) : "";

  let assistantText = "";
  let reasoningText = "";
  if (message) {
    message.parts.forEach((p) => {
      if (isTextPart(p)) {
        assistantText += (assistantText ? "\n\n" : "") + p.text;
      } else if (isReasoningPart(p) && p.text) {
        reasoningText += (reasoningText ? "\n\n" : "") + p.text;
      }
    });
  }

  const dump: TurnJsonDump = {
    timestamp: new Date().toISOString(),
    durationSec: timeLabel,
    telemetry: {
      totalTokens,
      inputTokens: inTokens,
      outputTokens: outTokens,
      cost: costFormatted,
      ...(contextUsage ? { contextUsage } : {}),
    },
    ...(userMessage
      ? {
          userMessage: {
            id: userMessage.id,
            text: userText,
          },
        }
      : {}),
    ...(message
      ? {
          assistantMessage: {
            id: message.id,
            text: assistantText,
            ...(reasoningText ? { reasoning: reasoningText } : {}),
            ...(message.metadata?.model ? { model: message.metadata.model } : {}),
            ...(message.metadata?.provider ? { provider: message.metadata.provider } : {}),
          },
        }
      : {}),
    steps: steps.map((s) => ({
      id: s.id,
      kind: s.kind,
      label: s.label,
      ...(s.subLabel ? { subLabel: s.subLabel } : {}),
      ...(s.isError !== undefined ? { isError: s.isError } : {}),
      ...(s.durationSec !== undefined ? { durationSec: s.durationSec } : {}),
      ...(s.stepIndex !== undefined ? { stepIndex: s.stepIndex } : {}),
      ...(s.info?.toolName ? { tool: s.info.toolName } : {}),
      ...(s.info?.input !== undefined ? { input: s.info.input } : {}),
      ...(s.info?.output !== undefined ? { output: s.info.output } : {}),
      ...(s.detailText ? { detailText: s.detailText } : {}),
    })),
    rawMessage: message,
  };

  return JSON.stringify(dump, null, 2);
}
