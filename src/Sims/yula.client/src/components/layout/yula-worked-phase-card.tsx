"use client";

import * as React from "react";
import {
  Check,
  ChevronRight,
  Loader2,
  PauseCircle,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { CodeBlock } from "@/components/ui/code-block";
import { cn } from "@/utils/cn";
import { useOptionalYulaChat } from "@/hooks/use-yula-chat";
import type { WorkedStepPhase } from "./yula-worked-steps";

export interface YulaWorkedPhaseCardProps {
  phase: WorkedStepPhase;
  phasePos: number;
  isLastPhase: boolean;
  isLive: boolean;
  isOpen: boolean;
  onToggle: () => void;
  lastStepRef?: React.RefObject<HTMLDivElement | null>;
}

export function YulaWorkedPhaseCard({
  phase,
  isLastPhase,
  isOpen,
  onToggle,
  lastStepRef,
}: YulaWorkedPhaseCardProps) {
  const [expandedStepId, setExpandedStepId] = React.useState<string | null>(null);
  const yula = useOptionalYulaChat();
  const isSuspended = Boolean(phase.isSuspended || (phase.isLive && yula?.isSuspended));

  return (
    <div className="flex flex-col gap-1 rounded-md border border-border/25 bg-muted/10 p-1.5 transition-colors">
      {/* Faz / Adım Başlığı Satırı */}
      <div
        onClick={onToggle}
        className="group/phase flex cursor-pointer items-center justify-between py-0.5 select-none"
      >
        <div className="flex items-center gap-1.5 min-w-0">
          {isSuspended ? (
            <PauseCircle className="size-3.5 text-amber-500 animate-pulse shrink-0" />
          ) : phase.isLive ? (
            <Loader2 className="size-3.5 animate-spin text-orange-500 shrink-0" />
          ) : phase.hasError ? (
            <TriangleAlert className="size-3.5 text-amber-500 shrink-0" />
          ) : phase.isRecovery ? (
            <Sparkles className="size-3.5 text-amber-500 shrink-0" />
          ) : (
            <Check className="size-3.5 text-emerald-500 shrink-0" />
          )}

          <span className="font-sans text-[12.5px] font-semibold text-foreground/90 truncate">
            {phase.label}
          </span>

          <span className="font-mono text-[10.5px] text-muted-foreground/70 shrink-0">
            (Adım {phase.phaseIndex + 1})
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {isSuspended && (
            <span className="rounded bg-amber-500/10 px-1.5 py-0.2 font-mono text-[9.5px] font-medium text-amber-600 dark:text-amber-400">
              ASKIDA
            </span>
          )}
          {phase.hasError && (
            <span className="rounded bg-red-500/10 px-1.5 py-0.2 font-mono text-[9.5px] font-medium text-red-600 dark:text-red-400">
              HATA
            </span>
          )}
          {phase.isRecovery && (
            <span className="rounded bg-amber-500/10 px-1.5 py-0.2 font-mono text-[9.5px] font-medium text-amber-600 dark:text-amber-400">
              KURTARMA
            </span>
          )}
          <ChevronRight
            className={cn(
              "size-3.5 text-muted-foreground/50 transition-transform duration-200 group-hover/phase:text-foreground/70",
              isOpen && "rotate-90 text-foreground/70"
            )}
          />
        </div>
      </div>

      {/* Neden-Sonuç Bağı (Causal Transition) */}
      {phase.transitionReason && (
        <div className="ml-5 flex items-center gap-1 text-[11px] font-sans text-amber-600/90 dark:text-amber-400/90">
          <span>↳ 🔄</span>
          <span className="italic">{phase.transitionReason}</span>
        </div>
      )}

      {/* Belirgin Hata Teşhis Satırı */}
      {phase.errorMessage && (
        <div className="ml-5 rounded bg-red-500/10 px-2 py-1 text-[11.5px] font-sans font-medium text-red-600 dark:text-red-400 border border-red-500/20">
          ❌ Hata Teşhisi: {phase.errorMessage}
        </div>
      )}

      {/* Faz İçi Adımlar ve Düşünceler */}
      {isOpen ? (
        <div className="ml-2.5 mt-1 flex flex-col gap-1.5 border-l border-border/40 pl-2.5">
          {phase.steps.map((step, stepPos) => {
            const isThought = step.kind === "thought";
            const isInspection = step.id.includes("context-inspection") || step.id.includes("wiki-level");
            const autoOpen = isThought || isInspection || Boolean(step.isError);
            const isManuallyToggled = expandedStepId === step.id;
            const isExpanded = autoOpen
              ? expandedStepId === null || expandedStepId === step.id
              : isManuallyToggled;

            const hasDetails = Boolean(step.detailText || step.info?.input || step.info?.output);
            const isLastStep = isLastPhase && stepPos === phase.steps.length - 1;

            return (
              <div
                key={step.id}
                ref={isLastStep ? lastStepRef : undefined}
                className="animate-in fade-in-0 slide-in-from-left-2 flex flex-col gap-1 duration-200"
              >
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
                      "font-sans text-[12px]",
                      step.isError
                        ? "text-amber-600 dark:text-amber-400 font-medium"
                        : isThought
                          ? "text-muted-foreground/90 italic"
                          : "text-foreground/85"
                    )}
                  >
                    {isThought ? `💡 ${step.label}` : step.label}
                  </span>

                  {step.subLabel ? (
                    <span className="truncate font-mono text-[10.5px] text-muted-foreground/70">
                      {step.subLabel}
                    </span>
                  ) : null}

                  {step.isLive ? (
                    <span className="ml-1 inline-flex items-center gap-1 text-[11px] text-orange-500 animate-pulse">
                      {isSuspended || step.isSuspended ? (
                        <PauseCircle className="size-3 text-amber-500 animate-pulse" />
                      ) : (
                        <Loader2 className="size-3 animate-spin" />
                      )}
                    </span>
                  ) : hasDetails ? (
                    <ChevronRight
                      className={cn(
                        "size-3 text-muted-foreground/50 transition-transform duration-200 group-hover/step:text-foreground/70",
                        isExpanded && "rotate-90 text-foreground/70"
                      )}
                    />
                  ) : null}
                </div>

                {/* Detay Gösterimi */}
                {isExpanded && hasDetails ? (
                  isThought && step.detailText ? (
                    <div className="pl-3 py-0.5 text-[11.5px] leading-relaxed text-muted-foreground/80 font-sans whitespace-pre-wrap select-text border-l-2 border-primary/20">
                      {step.detailText}
                    </div>
                  ) : (
                    <div className="ml-2 mt-0.5 overflow-hidden rounded-md border border-border/30 bg-muted/20 p-2 space-y-1 font-mono text-[10.5px]">
                      {step.detailText ? (
                        <div className="text-muted-foreground leading-snug whitespace-pre-wrap font-sans text-[11px] select-text">
                          {step.detailText}
                        </div>
                      ) : null}
                      {step.info ? (
                        <CodeBlock
                          value={JSON.stringify(
                            {
                              tool: step.info.toolName,
                              input: step.info.input,
                              output: step.info.output,
                            },
                            null,
                            2
                          )}
                          language="json"
                          className="max-h-48 border border-border/20 rounded p-1 text-[10px]"
                        />
                      ) : null}
                    </div>
                  )
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
