"use client";

import * as React from "react"
import { useTranslations } from "next-intl"
import { copyToClipboard } from "@/lib/clipboard";
import {
  ChevronRight,
  Copy,
  Check,
  CheckCircle2,
  AlertCircle,
  TriangleAlert,
  PauseCircle,
  CircleSlash,
  Loader2,
} from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/utils/cn";
import { useOptionalYulaChat } from "@/hooks/use-yula-chat";
import type { YulaMessage } from "@/app/api/agent/chat/route";
import { subscribeTurnTrace } from "@/lib/yula-turn-trace";
import {
  extractWorkedSteps,
  groupStepsByPhase,
} from "./yula-worked-steps";
import { modelCatalog, getMessageText, estimateTokens } from "@my-agent/core";
import { formatTokenCount } from "./yula-chat-turn-helpers";
import { buildFullCopyText } from "./yula-worked-copy";
import { YulaExecutionTerminal } from "./yula-execution-terminal";
import { YulaWorkedPhaseCard } from "./yula-worked-phase-card";

interface YulaWorkedAccordionProps {
  userMessage?: YulaMessage;
  message?: YulaMessage;
  isLive?: boolean;
  durationSec?: number;
  llmStepCount?: number;
  conversationId?: string;
  className?: string;
}

export function YulaWorkedAccordion({
  userMessage,
  message,
  isLive = false,
  durationSec,
  llmStepCount,
  conversationId,
  className,
}: YulaWorkedAccordionProps) {
  const t = useTranslations("WorkedAccordion");
  const ws = useTranslations("WorkedSteps");
  const yula = useOptionalYulaChat();
  const contextUsage = yula?.contextUsage;
  const [open, setOpen] = React.useState(isLive);
  const [userToggled, setUserToggled] = React.useState(false);
  const [liveTimer, setLiveTimer] = React.useState(0);
  const [copiedAnswer, setCopiedAnswer] = React.useState(false);
  /** Kullanıcının kapattığı fazlar — tüm fazlar varsayılan açık (şeffaf iz) */
  const [collapsedPhases, setCollapsedPhases] = React.useState<Set<number>>(new Set());

  /** Token kullanımı ve maliyet hesaplaması */
  const usage = message?.metadata?.usage as
    | {
        inputTokens?: number;
        outputTokens?: number;
        totalTokens?: number;
        promptTokens?: number;
        completionTokens?: number;
      }
    | undefined;

  const inTokens = usage ? (usage.inputTokens ?? usage.promptTokens ?? 0) : 0;
  const outTokens = usage ? (usage.outputTokens ?? usage.completionTokens ?? 0) : 0;
  const totalTokens = usage ? (usage.totalTokens ?? inTokens + outTokens) : 0;

  const userTok = React.useMemo(() => (userMessage ? estimateTokens(userMessage) : 0), [userMessage]);
  const assistantTok = React.useMemo(() => (message ? estimateTokens(message) : 0), [message]);

  const effectiveInTokens = inTokens > 0 ? inTokens : userTok;
  const effectiveOutTokens = outTokens > 0 ? outTokens : assistantTok;
  const effectiveTotalTokens =
    totalTokens > 0 ? totalTokens : effectiveInTokens + effectiveOutTokens;

  const costFormatted = React.useMemo(() => {
    if (effectiveTotalTokens <= 0) return null;
    const cost = modelCatalog.calculateCost("gpt-4o-mini", effectiveInTokens, effectiveOutTokens);
    return cost.formatted;
  }, [effectiveTotalTokens, effectiveInTokens, effectiveOutTokens]);

  const handleCopyAnswer = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!message && steps.length === 0) return;
    const fullText = buildFullCopyText({
      timeLabel,
      totalTokens: effectiveTotalTokens,
      inTokens: effectiveInTokens,
      outTokens: effectiveOutTokens,
      costFormatted,
      contextUsage,
      steps,
      userMessage,
      message,
      workedForText: t("worked_for", { timeLabel }),
      telemetryTokensLabel: t("telemetry_tokens"),
      telemetryInputLabel: t("telemetry_input"),
      telemetryOutputLabel: t("telemetry_output"),
      telemetryCostLabel: t("telemetry_cost"),
      telemetryContextLabel: t("telemetry_context"),
    });
    if (!fullText.trim()) return;
    const success = await copyToClipboard(fullText);
    if (success) {
      setCopiedAnswer(true);
      setTimeout(() => setCopiedAnswer(false), 2000);
    }
  };

  // Canlı akış zamanlayıcısı (Live streaming ticker) — Askıya alındığında (suspend) duraklar, saniye işlemez
  const startTimeRef = React.useRef<number | null>(null);
  const pausedAtRef = React.useRef<number | null>(null);
  const totalPausedMsRef = React.useRef(0);

  const isSuspended = Boolean(yula?.isSuspended);

  React.useEffect(() => {
    if (!isLive) {
      startTimeRef.current = null;
      pausedAtRef.current = null;
      totalPausedMsRef.current = 0;
      // eslint-disable-next-line react/set-state-in-effect -- live durum bittiğinde sayacı sıfırla
      setLiveTimer(0);
      return;
    }

    if (startTimeRef.current === null) {
      startTimeRef.current = Date.now();
    }

    if (isSuspended) {
      if (pausedAtRef.current === null) {
        pausedAtRef.current = Date.now();
      }
      return;
    }

    if (pausedAtRef.current !== null) {
      totalPausedMsRef.current += Date.now() - pausedAtRef.current;
      pausedAtRef.current = null;
    }

    const start = startTimeRef.current;
    const updateTimer = () => {
      const activeElapsed = Date.now() - start - totalPausedMsRef.current;
      setLiveTimer(Math.max(1, Math.floor(activeElapsed / 1000)));
    };
    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [isLive, isSuspended]);

  // Nihai cevap metni tamamlandığında (akış bittiğinde) akordeon otomatik katlanır
  const hasTextContent = React.useMemo(() => {
    if (!message) return false;
    return getMessageText(message, { excludeRoles: ["plan_rationale"] }).length > 0;
  }, [message]);

  const [traceRev, bumpTrace] = React.useReducer((n: number) => n + 1, 0);
  React.useEffect(() => subscribeTurnTrace(() => bumpTrace()), []);

  const steps = React.useMemo(() => {
    void traceRev; // turn-trace izi modül seviyesinde değişir; rev değişince yeniden hesap
    return extractWorkedSteps(message, isLive, userMessage, conversationId, ws);
  }, [message, isLive, userMessage, conversationId, traceRev, ws]);

  // groupStepsByPhase O(n) ve ucuz — memo'suz hesaplanır (React Compiler uyumu)
  const phases = groupStepsByPhase(steps);

  /** Yeni adım eklendiğinde (yalnızca canlı akışta) son adıma yumuşak kaydır */
  const lastStepRef = React.useRef<HTMLDivElement | null>(null);
  const prevStepCountRef = React.useRef(0);
  React.useEffect(() => {
    const count = steps.length;
    const grew = count > prevStepCountRef.current;
    prevStepCountRef.current = count;
    if (grew && isLive && open) {
      lastStepRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [steps.length, isLive, open]);

  React.useEffect(() => {
    const syncOpen = () => {
      if (userToggled) return;
      // Canlı akışta veya henüz cevap metni yokken açık tutulur.
      // Sadece gerçek RUN hatasında (akış koptu / streamErrorText) açık kalır.
      // Steplerde hata (warning) olsa bile yanıt metni üretildiyse run akordiyonu açık tutulmaz.
      const streamErrorText = message?.id ? yula?.streamErrorTexts?.[message.id] : undefined;
      const hasRunFatalError = Boolean(streamErrorText);
      const keepOpen = isLive || !hasTextContent || hasRunFatalError;
      setOpen(keepOpen);
    };
    syncOpen();
  }, [isLive, hasTextContent, userToggled, message?.id, yula?.streamErrorTexts]);

  // Akış bittikten sonra gösterilecek son timer değeri — state aynası
  // (render'da ref okunmaz).
  const [lastLiveTimer, setLastLiveTimer] = React.useState(0);
  const [syncedLiveTimer, setSyncedLiveTimer] = React.useState(liveTimer);
  if (syncedLiveTimer !== liveTimer) {
    setSyncedLiveTimer(liveTimer)
    if (liveTimer > 0) setLastLiveTimer(liveTimer)
  }

  const totalTime =
    durationSec ??
    (isLive
      ? liveTimer
      : lastLiveTimer > 0
      ? lastLiveTimer
      : steps.length > 0
      ? Math.max(1, steps.reduce((acc, s) => acc + (s.durationSec || 1), 0))
      : 1);

  const timeLabel = typeof totalTime === "number" ? Math.max(1, Math.round(totalTime)) : totalTime;


  const hasStepError = steps.some((s) => s.isError && s.kind !== "thought");

  // Run (Tur / Koşu) Genel Statüsü Belirleme
  const runStatus = React.useMemo(() => {
    if (isLive) {
      if (yula?.isSuspended) {
        return {
          type: "suspended" as const,
          icon: <PauseCircle className="size-3.5 text-amber-500 animate-pulse shrink-0" />,
          label: t("status_suspended"),
        };
      }
      return {
        type: "running" as const,
        icon: <Loader2 className="size-3.5 animate-spin text-primary shrink-0" />,
        label: t("status_running"),
      };
    }

    const streamErrorText = message?.id ? yula?.streamErrorTexts?.[message.id] : undefined;

    // 1. Run Hatası (Stream kopması, API hatası veya cevapsız çökme): Kırmızı Ünlem (AlertCircle)
    if (streamErrorText || (!hasTextContent && hasStepError)) {
      return {
        type: "error" as const,
        icon: <AlertCircle className="size-3.5 text-rose-500 shrink-0" />,
        label: t("status_error"),
      };
    }

    // 2. Step Hatası / Uyarısı (Adım hata aldı ama yanıt metni tamamlandı): Sarı Üçgen Uyarı (TriangleAlert)
    if (hasStepError) {
      return {
        type: "warning" as const,
        icon: <TriangleAlert className="size-3.5 text-amber-500 shrink-0" />,
        label: t("status_warning"),
      };
    }

    const isLastAssistantMessage = yula?.messages?.length
      ? yula.messages.slice().reverse().find((m) => m.role === "assistant")?.id === message?.id
      : false;
    if (yula?.stopped && isLastAssistantMessage) {
      return {
        type: "stopped" as const,
        icon: <CircleSlash className="size-3.5 text-amber-500 shrink-0" />,
        label: t("status_stopped"),
      };
    }

    return {
      type: "completed" as const,
      icon: <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0" />,
      label: t("status_completed"),
    };
  }, [
    isLive,
    hasTextContent,
    hasStepError,
    yula?.isSuspended,
    yula?.streamErrorTexts,
    yula?.stopped,
    yula?.messages,
    message?.id,
    t,
  ]);

  // Worker her zaman: asistan, canlı akış, süre veya görünür adım varsa
  if (!message && !isLive && !durationSec && steps.length === 0) return null;

  const hasExpandableContent = steps.length > 0;

  return (
    <Collapsible
      open={open && hasExpandableContent}
      onOpenChange={(val) => {
        if (!hasExpandableContent) return;
        setUserToggled(true);
        setOpen(val);
      }}
      className={cn("my-1 w-full select-none font-sans", className)}
    >
      <div className="group/worked flex w-full items-center justify-between py-0.5">
        <CollapsibleTrigger
          disabled={!hasExpandableContent}
          className={cn(
            "flex items-center gap-1.5 text-[12.5px] font-medium text-muted-foreground/90 transition-colors",
            hasExpandableContent ? "hover:text-foreground cursor-pointer" : "cursor-default"
          )}
        >
          {/* Run Durumu İkonu (Çalışıyor: Spinner, Onay Bekliyor: Pause, Hata: Ünlem, Durduruldu: CircleSlash, Tamamlandı: Tik) */}
          <span className="inline-flex items-center shrink-0" title={runStatus.label}>
            {runStatus.icon}
          </span>

          <span className="font-sans text-foreground/90 font-medium flex items-center gap-1.5">
            <span>{t("worked_for", { timeLabel })}</span>
            {runStatus.type === "suspended" ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[10.5px] font-medium text-amber-600 dark:text-amber-400 border border-amber-500/20 animate-pulse">
                {runStatus.label}
              </span>
            ) : null}
            {effectiveTotalTokens > 0 ? (
              <span className="font-mono text-[11px] text-muted-foreground/60 font-normal">
                · {formatTokenCount(effectiveTotalTokens)} tok
              </span>
            ) : null}
          </span>

          <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/70 transition-transform duration-200 group-data-[state=open]/worked:rotate-90" />
        </CollapsibleTrigger>

        <div className="ml-auto flex items-center gap-1">
          {/* Worked For Satırının En Sağındaki Çerçevesiz Transparan Hover Kopyalama Butonu */}
          {!isLive && (hasTextContent || steps.length > 0) ? (
            <button
              type="button"
              onClick={handleCopyAnswer}
              title={copiedAnswer ? ws("tour_copy_done") : ws("tour_copy")}
              className="flex items-center justify-center p-0.5 rounded-md border-0 bg-transparent text-muted-foreground/60 hover:text-foreground opacity-0 group-hover/worked:opacity-100 transition-opacity cursor-pointer select-none"
            >
              {copiedAnswer ? (
                <Check className="size-3.5 text-emerald-500" />
              ) : (
                <Copy className="size-3.5" />
              )}
            </button>
          ) : null}
        </div>
      </div>

      {/* Causal Step Frame & ReAct Faz Çizelgesi */}
      {hasExpandableContent ? (
        <CollapsibleContent className="mt-1.5 space-y-1.5 pl-1">
          <div className="flex flex-col gap-2 text-[12.5px] font-sans text-muted-foreground/90">
            {phases.map((phase, phasePos) => {
              const phaseOpen = !collapsedPhases.has(phase.phaseIndex);
              const isLastPhase = phasePos === phases.length - 1;
              return (
                <YulaWorkedPhaseCard
                  key={`phase-${phase.phaseIndex}`}
                  phase={phase}
                  phasePos={phasePos}
                  isLastPhase={isLastPhase}
                  isLive={isLive}
                  isOpen={phaseOpen}
                  onToggle={() => {
                    setCollapsedPhases((prev) => {
                      const next = new Set(prev);
                      if (next.has(phase.phaseIndex)) next.delete(phase.phaseIndex);
                      else next.add(phase.phaseIndex);
                      return next;
                    });
                  }}
                  lastStepRef={isLastPhase ? lastStepRef : undefined}
                />
              );
            })}
          </div>

          {/* Canlı Telemetri & Token Kullanımı Özeti */}
          {!isLive ? (
            <YulaExecutionTerminal
              userMessage={userMessage}
              steps={steps}
              totalTokens={effectiveTotalTokens}
              inTokens={effectiveInTokens}
              outTokens={effectiveOutTokens}
              costFormatted={costFormatted}
              contextUsage={contextUsage}
              timeLabel={timeLabel}
              durationSec={durationSec}
              llmStepCount={llmStepCount}
            />
          ) : null}
        </CollapsibleContent>
      ) : null}
    </Collapsible>
  );
}
