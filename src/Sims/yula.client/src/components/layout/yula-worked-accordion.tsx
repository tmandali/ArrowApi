"use client";

import * as React from "react";
import { copyToClipboard } from "@/lib/clipboard";
import {
  ChevronRight,
  Loader2,
  Copy,
  Check,
} from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { CodeBlock } from "@/components/ui/code-block";
import { cn } from "@/utils/cn";
import type { YulaMessage } from "@/app/api/agent/chat/route";
import { subscribeTurnTrace } from "@/lib/yula-turn-trace";
import {
  extractWorkedSteps,
  type WorkedStepItem,
} from "./yula-worked-steps";

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
  conversationId,
  className,
}: YulaWorkedAccordionProps) {
  const [open, setOpen] = React.useState(isLive);
  const [userToggled, setUserToggled] = React.useState(false);
  const [liveTimer, setLiveTimer] = React.useState(0);
  const [expandedStepId, setExpandedStepId] = React.useState<string | null>(null);
  const [copiedAnswer, setCopiedAnswer] = React.useState(false);

  /** Adım detay bloğu — ekrandaki CodeBlock ile aynı alanlar (sql/display çıkarılmış) */
  const stepPayload = (step: WorkedStepItem): string | null => {
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
  };

  /** "Worked for" başlığı + tüm adım detayları + nihai cevap metni */
  const buildFullCopyText = (): string => {
    const sections: string[] = [];
    sections.push(`Worked for ${timeLabel}s`);

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
          if (p.type === "text") return (p as { text: string }).text;
          if (p.type === "reasoning" && (p as { text?: string }).text) {
            return `[Düşünme / Reasoning]\n${(p as { text: string }).text}`;
          }
          return "";
        })
        .filter(Boolean)
        .join("\n\n");
      if (fullText.trim()) sections.push(`———\n${fullText}`);
    }

    return sections.join("\n\n");
  };

  const handleCopyAnswer = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!message) return;
    const fullText = buildFullCopyText();
    if (!fullText.trim()) return;
    const success = await copyToClipboard(fullText);
    if (success) {
      setCopiedAnswer(true);
      setTimeout(() => setCopiedAnswer(false), 2000);
    }
  };

  // Canlı akış zamanlayıcısı (Live streaming ticker) — Tur boyunca (tüm araçlar/turlar bitene kadar) kesintisiz sayar
  const startTimeRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    const resetLiveTimer = () => {
      startTimeRef.current = null;
      setLiveTimer(0);
    };
    if (!isLive) {
      resetLiveTimer();
      return;
    }
    if (startTimeRef.current === null) {
      startTimeRef.current = Date.now();
    }
    const start = startTimeRef.current;
    const updateTimer = () => {
      setLiveTimer(Math.max(1, Math.floor((Date.now() - start) / 1000)));
    };
    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [isLive]);

  // Nihai cevap metni tamamlandığında (akış bittiğinde) akordeon otomatik katlanır
  const hasTextContent = React.useMemo(() => {
    if (!message) return false;
    return message.parts.some(
      (p) => p.type === "text" && (p.text ?? "").trim().length > 0
    );
  }, [message]);

  const [traceRev, bumpTrace] = React.useReducer((n: number) => n + 1, 0);
  React.useEffect(() => subscribeTurnTrace(() => bumpTrace()), []);

  const steps = React.useMemo(() => {
    void traceRev; // turn-trace izi modül seviyesinde değişir; rev değişince yeniden hesap
    return extractWorkedSteps(message, isLive, userMessage, conversationId);
  }, [message, isLive, userMessage, conversationId, traceRev]);

  React.useEffect(() => {
    const syncOpen = () => {
      if (userToggled) return;
      // Yanıt bitince (canlı akış yok, cevap metni var, hata yok) akordeon
      // kendini kapatır; isLive tüm tur (araç yürütmeleri dahil) süresince açık tutar.
      const keepOpen = isLive || !hasTextContent || steps.some((s) => s.isError);
      setOpen(keepOpen);
    };
    syncOpen();
  }, [isLive, hasTextContent, userToggled, steps]);

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
          <span className="font-sans text-foreground/90 font-medium flex items-center gap-1">
            <span>Worked for {timeLabel}s</span>
          </span>

          <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/70 transition-transform duration-200 group-data-[state=open]/worked:rotate-90" />
        </CollapsibleTrigger>

        {/* Worked For Satırının En Sağındaki Çerçevesiz Transparan Hover Kopyalama Butonu */}
        {!isLive && hasTextContent ? (
          <button
            type="button"
            onClick={handleCopyAnswer}
            title={copiedAnswer ? "Cevap Kopyalandı" : "Tüm Cevap Metnini Kopyala"}
            className="ml-auto flex items-center justify-center p-0.5 rounded-md border-0 bg-transparent text-muted-foreground/60 hover:text-foreground opacity-0 group-hover/worked:opacity-100 transition-opacity cursor-pointer select-none"
          >
            {copiedAnswer ? (
              <Check className="size-3.5 text-emerald-500" />
            ) : (
              <Copy className="size-3.5" />
            )}
          </button>
        ) : null}
      </div>

      {/* Gemini Stili Adım Adım Çalıştırma ve Düşünme Çizelgesi */}
      {hasExpandableContent ? (
        <CollapsibleContent className="mt-1.5 space-y-1.5 pl-1">
          <div className="flex flex-col gap-1.5 text-[12.5px] font-sans text-muted-foreground/90">
            {steps.map((step) => {
              // Düşünme adımları varsayılan olarak açık başlar (Gemini stili)
              const isThought = step.kind === "thought";
              const autoOpen = isThought || Boolean(step.isError);
              const isManuallyToggled = expandedStepId === step.id;
              const isExpanded = autoOpen
                ? expandedStepId === null || expandedStepId === step.id
                : isManuallyToggled;

              const hasDetails = Boolean(step.detailText || step.info?.input || step.info?.output);
              const outputObj = (step.info?.output as Record<string, unknown> | null) ?? {};
              // step-start sonrası parçalar kendi adım seviyesinde girintili görünür
              const indent = step.stepIndex == null ? 0 : 16;

              return (
                <div
                  key={step.id}
                  style={indent ? { marginLeft: indent } : undefined}
                  className="flex flex-col gap-1"
                >
                  {/* Adım Başlığı Satırı */}
                  <div
                    onClick={() => {
                      if (hasDetails) {
                        setExpandedStepId(isExpanded ? `closed-${step.id}` : step.id);
                      }
                    }}
                    className={cn(
                      "group/step flex items-center gap-1.5 py-0.5 text-foreground/90 transition-colors select-none",
                      hasDetails ? "cursor-pointer hover:text-foreground" : "cursor-default"
                    )}
                  >
                    <span
                      className={cn(
                        "font-sans font-normal text-[12.5px]",
                        step.isError
                          ? "text-red-600 dark:text-red-400"
                          : "text-foreground/85",
                      )}
                    >
                      {step.label}
                    </span>
                    {step.subLabel ? (
                      <span className="truncate font-mono text-[10.5px] text-muted-foreground/70">
                        {step.subLabel}
                      </span>
                    ) : null}

                    {step.diffBadge ? (
                      <span className="inline-flex items-center gap-1 font-mono text-[10.5px]">
                        <span className="text-emerald-500 dark:text-emerald-400 font-medium">
                          +{step.diffBadge.added}
                        </span>
                        <span className="text-red-500 dark:text-red-400 font-medium">
                          -{step.diffBadge.removed}
                        </span>
                      </span>
                    ) : null}

                    {step.isLive ? (
                      <span className="ml-1 inline-flex items-center gap-1 text-[11px] text-orange-500 animate-pulse">
                        <Loader2 className="size-3 animate-spin" />
                      </span>
                    ) : hasDetails ? (
                      <ChevronRight
                        className={cn(
                          "size-3.5 text-muted-foreground/50 transition-transform duration-200 group-hover/step:text-foreground/70",
                          isExpanded && "rotate-90 text-foreground/70"
                        )}
                      />
                    ) : null}
                  </div>

                  {/* Gemini Stili Doğrudan İçe Girintili Düşünme / Detay Metni */}
                  {isExpanded && hasDetails ? (
                    isThought && step.detailText ? (
                      <div className="pl-4 py-0.5 text-[12px] leading-relaxed text-muted-foreground/80 font-sans whitespace-pre-wrap select-text">
                        {step.detailText}
                      </div>
                    ) : (
                      <div className="ml-4 mt-1 overflow-hidden rounded-lg border border-border/30 bg-muted/20 p-2 space-y-1.5 font-mono text-[11px] backdrop-blur-xs select-none">
                        {step.detailText ? (
                          <div className="text-muted-foreground leading-snug px-0.5">{step.detailText}</div>
                        ) : null}

                        {/* Araç Adı, Giden Parametreler (Input) ve Gelen Çıktı (Output) ile Tek Renkli JSON Bloğu */}
                        {step.info ? (
                          <CodeBlock
                            value={(() => {
                              const out = (() => {
                                if (!step.info?.output || typeof step.info.output !== "object") return step.info?.output ?? null;
                                const cleaned = { ...(step.info.output as Record<string, unknown>) };
                                if (step.info.input && typeof step.info.input === "object" && "sql" in step.info.input) {
                                  delete cleaned.sql;
                                  delete cleaned.display;
                                }
                                return cleaned;
                              })();
                              const body: Record<string, unknown> = {
                                tool: step.info.toolName,
                                input: step.info.input,
                              };
                              if (out !== null && out !== undefined) body.output = out;
                              return JSON.stringify(body, null, 2);
                            })()}
                            language="json"
                            className="max-h-52 border border-border/20 rounded-md p-1.5 text-[10.5px] font-mono leading-tight shadow-none"
                          />
                        ) : outputObj.error ? (
                          <div className="text-[10.5px] text-red-500 font-medium px-0.5">
                            Hata: {String(outputObj.error)}
                          </div>
                        ) : null}
                      </div>
                    )
                  ) : null}
                </div>
              );
            })}
          </div>
        </CollapsibleContent>
      ) : null}
    </Collapsible>
  );
}
