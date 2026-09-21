import type { YulaMessage } from "@/app/api/agent/chat/route";
import type { WorkedStepItem } from "./yula-worked-steps";
import { formatTokenCount } from "./yula-chat-turn-helpers";
import { isTextPart, isReasoningPart } from "@my-agent/core";

/** Adım detay bloğu — ekrandaki CodeBlock ile aynı alanlar (sql/display çıkarılmış) */
export function stepPayload(step: WorkedStepItem): string | null {
  if (!step.info) return null;
  const out = (() => {
    if (!step.info?.output || typeof step.info.output !== "object") return step.info?.output ?? null;
    const cleaned = { ...(step.info.output as Record<string, unknown>) };
    if (step.info.input && typeof step.info.input === "object" && "sql" in step.info.input) {
      delete cleaned.sql;
      delete cleaned.display;
    }
    return cleaned;
  })();
  const body: Record<string, unknown> = { tool: step.info.toolName, input: step.info.input };
  // Sınır işaretlerinde output hiç üretilmez: null alanı basmak yerine atla
  if (out !== null && out !== undefined) body.output = out;
  return JSON.stringify(body, null, 2);
}

export interface BuildFullCopyTextParams {
  timeLabel: number | string;
  totalTokens: number;
  inTokens: number;
  outTokens: number;
  costFormatted: string | null;
  contextUsage?: { percent: number; tokens: number; contextWindow: number };
  steps: WorkedStepItem[];
  message?: YulaMessage;
  workedForText: string;
  telemetryTokensLabel: string;
  telemetryInputLabel: string;
  telemetryOutputLabel: string;
  telemetryCostLabel: string;
  telemetryContextLabel: string;
}

/** "Worked for" başlığı + tüm adım detayları + nihai cevap metni */
export function buildFullCopyText({
  timeLabel,
  totalTokens,
  inTokens,
  outTokens,
  costFormatted,
  contextUsage,
  steps,
  message,
  workedForText,
  telemetryTokensLabel,
  telemetryInputLabel,
  telemetryOutputLabel,
  telemetryCostLabel,
  telemetryContextLabel,
}: BuildFullCopyTextParams): string {
  const sections: string[] = [];
  const headerTitle =
    totalTokens > 0
      ? `${workedForText} · ${formatTokenCount(totalTokens)} tok`
      : workedForText;
  sections.push(headerTitle);

  if (totalTokens > 0) {
    const contextStr =
      contextUsage?.percent !== undefined
        ? ` · ${telemetryContextLabel}: %${contextUsage.percent.toFixed(1)} / ${Math.round(contextUsage.contextWindow / 1000)}k`
        : "";
    sections.push(
      `📊 ${telemetryTokensLabel}: ${totalTokens.toLocaleString()} (${telemetryInputLabel}: ${inTokens.toLocaleString()}, ${telemetryOutputLabel}: ${outTokens.toLocaleString()}) · ${telemetryCostLabel}: ${costFormatted || "$0.000000"}${contextStr} · ${timeLabel}s`
    );
  }

  steps.forEach((step, index) => {
    const lines = [`${index + 1}. ${step.label}${step.subLabel ? ` (${step.subLabel})` : ""}`];
    if (step.detailText) lines.push(`   ${step.detailText}`);
    const payload = stepPayload(step);
    if (payload) lines.push(payload);
    sections.push(lines.join("\n"));
  });

  if (message) {
    const fullText = message.parts
      .map((p) => {
        if (isTextPart(p)) return p.text;
        if (isReasoningPart(p) && p.text) {
          return `[Thinking / Reasoning]\n${p.text}`;
        }
        return "";
      })
      .filter(Boolean)
      .join("\n\n");
    if (fullText.trim()) sections.push(`———\n${fullText}`);
  }

  return sections.join("\n\n");
}
