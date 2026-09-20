"use client";

import {
  yulaToolPartInfo,
  isFailedToolInfo,
  type YulaToolPartInfo,
} from "@/lib/yula-tool-info";
import type { useTranslations } from "next-intl";
import type { YulaMessage } from "@/app/api/agent/chat/route";
import { resolveYulaSlashCommand } from "@/components/layout/yula-commands";
import { getTurnTrace } from "@/lib/yula-turn-trace";
import type { TurnTraceStep } from "@/lib/yula-turn-trace";
import { PI_TRACE_ID_PREFIX } from "@/lib/my-agent-pi-bridge";
import { mapToolInfoToWorkedSteps } from "./yula-worked-steps-tools";

/** Modül-seviyesi adım üreticileri hook kullanamadığından, bileşen tarafı
 * `useTranslations("WorkedSteps")`'ı buraya taşır. */
export type WorkedStepsT = ReturnType<typeof useTranslations>;

export interface WorkedStepItem {
  id: string;
  kind: "explored" | "edited" | "thought" | "ran" | "confirmation";
  label: string;
  subLabel?: string;
  diffBadge?: { added: number; removed: number };
  durationSec?: number;
  isLive?: boolean;
  isError?: boolean;
  detailText?: string;
  info?: YulaToolPartInfo;
  /** Ait olduğu LLM adımının sırası (step-start sayacı) — Worked görünümünde girinti */
  stepIndex?: number;
}

export interface WorkedStepPhase {
  phaseIndex: number;
  label: string;
  steps: WorkedStepItem[];
  hasError: boolean;
  isLive: boolean;
}

const PHASE_LABEL_BY_KIND: Record<WorkedStepItem["kind"], string> = {
  explored: "Exploration",
  edited: "Updates",
  ran: "Execution",
  confirmation: "Confirmation",
  thought: "Thinking",
};

/** Düz adım listesini stepIndex (step-start sınırı) bazında fazlara böler.
 *  Faz etiketi, fazdaki ilk düşünce-dışı adımın türünden türetilir (İngilizce). */
export function groupStepsByPhase(steps: WorkedStepItem[]): WorkedStepPhase[] {
  const buckets = new Map<number, WorkedStepItem[]>();
  for (const step of steps) {
    const key = step.stepIndex ?? 0;
    const list = buckets.get(key);
    if (list) list.push(step);
    else buckets.set(key, [step]);
  }
  return [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([phaseIndex, phaseSteps]) => {
      const anchor = phaseSteps.find((s) => s.kind !== "thought") ?? phaseSteps[0];
      return {
        phaseIndex,
        label: anchor ? PHASE_LABEL_BY_KIND[anchor.kind] : "Thinking",
        steps: phaseSteps,
        hasError: phaseSteps.some((s) => s.isError),
        isLive: phaseSteps.some((s) => s.isLive),
      };
    });
}

function traceToWorkedStep(step: TurnTraceStep, isLiveStreaming?: boolean): WorkedStepItem {
  const pending = Boolean(isLiveStreaming && step.isLive);
  return {
    id: step.id,
    kind: step.isError ? "ran" : "explored",
    label: step.label,
    subLabel: step.subLabel,
    detailText: step.detailText,
    isLive: pending,
    isError: step.isError,
    info: {
      toolCallId: step.id,
      toolName: step.toolName ?? "worker",
      state: pending
        ? "input-available"
        : step.isError
          ? "output-error"
          : "output-available",
      input: step.input,
      output: step.output,
      errorText: step.isError ? step.detailText : undefined,
    },
  };
}

/** Statik ve dinamik parçalardan işlem, düşünme ve gizlenen worker adımlarını çıkarır */
export function extractWorkedSteps(
  message?: YulaMessage,
  isLiveStreaming?: boolean,
  userMessage?: YulaMessage,
  conversationId?: string,
  t?: WorkedStepsT,
): WorkedStepItem[] {
  const steps: WorkedStepItem[] = [];
  const L = (key: Parameters<WorkedStepsT>[0], values?: Parameters<WorkedStepsT>[1]) =>
    t ? t(key, values) : "";

  if (conversationId) {
    // Tüm aşama izleri görünür: İstek alındı, Phase, RAG, Araç seti, HTTP, hatalar
    for (const trace of getTurnTrace(conversationId)) {
      steps.push(traceToWorkedStep(trace, isLiveStreaming));
    }
  }

  // Pi köprüsü (`my-agent-pi-bridge`) aynı çağrıyı trace'e yazdıysa parça
  // sürümü atlanır — canlı güncellenen trace satırı tek kaynak olur.
  const piCoveredIds = new Set<string>();
  if (conversationId) {
    for (const trace of getTurnTrace(conversationId)) {
      if (trace.id.startsWith(PI_TRACE_ID_PREFIX)) {
        piCoveredIds.add(trace.id.slice(PI_TRACE_ID_PREFIX.length));
      }
    }
  }

  const userText = userMessage?.parts
    ?.filter((p) => p.type === "text")
    ?.map((p) => (p as { text: string }).text)
    ?.join("\n")
    ?.trim();

  const matchedCmd = userText ? resolveYulaSlashCommand(userText) : null;
  if (matchedCmd && matchedCmd.phase !== "system") {
    const cmdName = `/${matchedCmd.slash}`;
    const hasError = Boolean(
      message?.parts?.some((p) => {
        const info = yulaToolPartInfo(p);
        return info ? isFailedToolInfo(info) : false;
      }),
    );
    steps.push({
      id: `${message?.id ?? "cmd"}-command-execution`,
      kind: "explored",
      label: `Command: ${cmdName}`,
      subLabel: isLiveStreaming ? `Executing ${cmdName} command workflow...` : "Command execution workflow",
      isLive: isLiveStreaming && !message?.parts.some((p) => p.type !== "text"),
      info: {
        toolCallId: `${message?.id ?? "cmd"}-command`,
        toolName: "slash_command",
        state: hasError ? "output-error" : "output-available",
        input: { command: cmdName, prompt: userText },
        output: {
          status: hasError ? "error" : "ok",
          message: L("cmd_executed", { cmd: cmdName, label: matchedCmd.label }),
        },
      },
    });
  }

  if (!message) {
    if (isLiveStreaming && steps.length === 0) {
      steps.push({
        id: "live-initial-planning",
        kind: "thought",
        label: "Thinking & reasoning...",
        subLabel: L("planning_sub"),
        detailText: L("planning_detail"),
        isLive: true,
      });
    }
    return steps;
  }

  // step-start işaretine göre güncel LLM adımı; parçalar bu adıma bağlanır
  let currentStep = -1;

  const pushStep = (s: WorkedStepItem) =>
    steps.push({ ...s, stepIndex: currentStep < 0 ? 0 : currentStep });

  // 0. Proaktif Wiki / Playbook Seviyesi Okuma Adımı
  const wikiMeta = (message as any)?.metadata?.wiki;
  if (wikiMeta) {
    const levelLabel =
      wikiMeta.level === "workspace"
        ? `Workspace Wiki (${wikiMeta.workspaceId})`
        : wikiMeta.level === "user"
          ? "User Wiki (Personal)"
          : "System Baseline Wiki";
    const hasRules = wikiMeta.rulesCount > 0;
    pushStep({
      id: `${message.id}-wiki-level`,
      kind: "explored",
      label: hasRules
        ? `Read ${wikiMeta.rulesCount} rules from ${levelLabel}`
        : `Checked ${levelLabel}`,
      subLabel: hasRules
        ? (wikiMeta.targetPath ? `Scope: ${wikiMeta.targetPath}` : "Verified guidelines active")
        : "No custom screen rules — system baseline active",
      detailText: hasRules
        ? wikiMeta.rules.map((r: string) => `• ${r}`).join("\n")
        : `Checked procedural memory at ${levelLabel} for ${wikiMeta.targetPath || "/"}. No custom overrides found; standard baseline policies applied.`,
      isLive: false,
      isError: false,
      info: {
        toolCallId: `${message.id}-wiki-level`,
        toolName: "wiki_context",
        state: "output-available",
        input: {
          level: wikiMeta.level,
          workspace: wikiMeta.workspaceId,
          targetPath: wikiMeta.targetPath,
        },
        output: {
          rulesCount: wikiMeta.rulesCount,
          rules: wikiMeta.rules,
        },
      },
    });
  }

  message.parts.forEach((part, index) => {
    if (part.type === "reasoning") {
      const raw = part.text ?? "";
      if (!raw.trim()) return;
      const meta = (part as { meta?: string }).meta;
      const isThinking = !meta || meta === "thinking";
      const approxDuration = Math.max(1, Math.round(raw.length / 60));

      pushStep({
        id: `${message.id}-reasoning-${index}`,
        kind: "thought",
        label: isThinking
          ? isLiveStreaming
            ? "Thinking & reasoning..."
            : `Thought for ${approxDuration}s`
          : `Reasoning (${meta})`,
        subLabel: `${approxDuration}s`,
        durationSec: approxDuration,
        detailText: raw,
        isLive: isLiveStreaming,
        isError: false,
      });
      return;
    }

    if (part.type === "text") {
      // Metin parçaları doğrudan sohbet mesajı balonunda render edilir.
      return;
    }

    if (part.type === "step-start") {
      // step-start bir satır değil, adım sınırıdır: sonraki parçalar
      // yeni adıma girintili bağlanır
      currentStep += 1;
      return;
    }

    const info = yulaToolPartInfo(part);
    if (!info) {
      pushStep({
        id: `${message.id}-part-${index}`,
        kind: "explored",
        label: `Part: ${part.type ?? "unknown"}`,
        subLabel: isLiveStreaming ? "Incoming part..." : "unparsed",
        isLive: isLiveStreaming,
        info: {
          toolCallId: `${message.id}-part-${index}`,
          toolName: String(part.type ?? "unknown_part"),
          state: "output-available",
          input: part,
          output: null,
        },
      });
      return;
    }

    // Pi trace satırı varsa parça sürümünü üretme (çift satır engeli).
    if (piCoveredIds.has(info.toolCallId)) return;

    const toolSteps = mapToolInfoToWorkedSteps(info, Boolean(isLiveStreaming), L);
    for (const s of toolSteps) {
      pushStep(s);
    }
  });

  if (isLiveStreaming && steps.length === 0) {
    steps.push({
      id: `${message?.id ?? "live"}-initial-planning`,
      kind: "thought",
      label: "Thinking & reasoning...",
      subLabel: L("planning_sub"),
      detailText: L("planning_detail"),
      isLive: true,
    });
  }

  // step-start artık satır üretmediği için yalnız metinden oluşan yanıtlarda
  // (thinking kapalıyken tipik durum) adım listesi boş kalır: tek satırlık özet ekle
  if (!isLiveStreaming && steps.length === 0 && message) {
    const hasText = message.parts.some(
      (p) => p.type === "text" && ((p as { text?: string }).text ?? "").trim().length > 0,
    );
    if (hasText) {
      steps.push({
        id: `${message.id}-direct-answer`,
        kind: "ran",
        label: "Composed answer",
        subLabel: "Direct response",
      });
    }
  }

  return steps;
}
