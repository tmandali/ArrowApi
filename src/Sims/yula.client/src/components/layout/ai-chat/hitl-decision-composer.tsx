"use client";

import * as React from "react";
import { Terminal, HelpCircle, ShieldAlert, CornerDownLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/cn";
import type { HitlPromptData, HitlOption } from "@/lib/contracts/hitl-prompt";

export interface HitlDecisionComposerProps {
  prompt: HitlPromptData;
  onSubmit: (result: string) => void;
  onSkip?: () => void;
  disabled?: boolean;
}

/**
 * Interactive Decision Composer Dock.
 * Transforms the bottom chat composer into an ergonomic, CLI-style approval/choice card
 * with keyboard shortcuts (1-9, Enter to submit, Esc to skip), monospace code block, and custom input.
 */
export function HitlDecisionComposer({
  prompt,
  onSubmit,
  onSkip,
  disabled = false,
}: HitlDecisionComposerProps) {
  const [selectedOptionId, setSelectedOptionId] = React.useState<string>(
    prompt.defaultOptionId || prompt.options[0]?.id || "",
  );
  const [customText, setCustomText] = React.useState<string>("");
  const [isSubmitting, setIsSubmitting] = React.useState<boolean>(false);
  const customInputRef = React.useRef<HTMLTextAreaElement>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);

  const fallbackOptionId = prompt.defaultOptionId || prompt.options[0]?.id || "";
  const effectiveOptionId = prompt.options.some((o) => o.id === selectedOptionId)
    ? selectedOptionId
    : fallbackOptionId;

  const activeOption = React.useMemo(
    () => prompt.options.find((o) => o.id === effectiveOptionId),
    [prompt.options, effectiveOptionId],
  );

  const isCustomActive = Boolean(activeOption?.isCustomInput);

  // Focus custom input when selected, or focus container to capture keyboard navigation
  React.useEffect(() => {
    if (isCustomActive) {
      requestAnimationFrame(() => {
        customInputRef.current?.focus();
      });
    } else {
      if (document.activeElement && document.activeElement !== document.body && document.activeElement !== containerRef.current) {
        (document.activeElement as HTMLElement).blur?.();
      }
      containerRef.current?.focus();
    }
  }, [isCustomActive]);

  React.useEffect(() => {
    const el = containerRef.current?.querySelector(`[data-option-id="${selectedOptionId}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedOptionId]);

  const handleSelectOption = React.useCallback(
    (opt: HitlOption) => {
      if (disabled || isSubmitting) return;
      setSelectedOptionId(opt.id);
    },
    [disabled, isSubmitting],
  );

  const handleFinalSubmit = React.useCallback(() => {
    if (disabled || isSubmitting || !activeOption) return;

    if (activeOption.isCustomInput) {
      const trimmed = customText.trim();
      if (!trimmed) return;
      setIsSubmitting(true);
      onSubmit(trimmed);
      return;
    }

    const payload = activeOption.value || activeOption.label;
    setIsSubmitting(true);
    onSubmit(payload);
  }, [disabled, isSubmitting, activeOption, customText, onSubmit]);

  const handleSkip = React.useCallback(() => {
    if (disabled || isSubmitting) return;
    setIsSubmitting(true);
    if (onSkip) {
      onSkip();
    } else {
      onSubmit("skip");
    }
  }, [disabled, isSubmitting, onSkip, onSubmit]);

  // Global keyboard shortcuts (↑/↓ to navigate, 1-9 to select, Enter to submit, Esc to skip)
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (disabled || isSubmitting) return;

      const isInsideCustom = document.activeElement === customInputRef.current;

      // 1. Enter Key
      if (e.key === "Enter" && !e.shiftKey) {
        if (isInsideCustom) {
          if (customText.trim()) {
            e.preventDefault();
            handleFinalSubmit();
          }
          return;
        }
        e.preventDefault();
        handleFinalSubmit();
        return;
      }

      // If user is actively typing in the custom textarea, allow editing
      if (isInsideCustom) {
        if (e.key === "Escape") {
          e.preventDefault();
          customInputRef.current?.blur();
          containerRef.current?.focus();
        }
        return;
      }

      // 2. Arrow Navigation (Down / Right = Next, Up / Left = Prev)
      if (e.key === "ArrowDown" || e.key === "ArrowRight") {
        e.preventDefault();
        const curIdx = prompt.options.findIndex((o) => o.id === selectedOptionId);
        const nextIdx = curIdx < prompt.options.length - 1 ? curIdx + 1 : 0;
        if (prompt.options[nextIdx]) {
          setSelectedOptionId(prompt.options[nextIdx].id);
        }
        return;
      }

      if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
        e.preventDefault();
        const curIdx = prompt.options.findIndex((o) => o.id === selectedOptionId);
        const prevIdx = curIdx > 0 ? curIdx - 1 : prompt.options.length - 1;
        if (prompt.options[prevIdx]) {
          setSelectedOptionId(prompt.options[prevIdx].id);
        }
        return;
      }

      // 3. Tab cycling
      if (e.key === "Tab") {
        e.preventDefault();
        const curIdx = prompt.options.findIndex((o) => o.id === selectedOptionId);
        const targetIdx = e.shiftKey
          ? (curIdx > 0 ? curIdx - 1 : prompt.options.length - 1)
          : (curIdx < prompt.options.length - 1 ? curIdx + 1 : 0);
        if (prompt.options[targetIdx]) {
          setSelectedOptionId(prompt.options[targetIdx].id);
        }
        return;
      }

      // 4. Escape to skip
      if (e.key === "Escape" && prompt.allowSkip) {
        e.preventDefault();
        handleSkip();
        return;
      }

      // 5. 1-9 digit shortcuts
      const digit = parseInt(e.key, 10);
      if (!Number.isNaN(digit) && digit >= 1 && digit <= 9) {
        const targetOption = prompt.options.find(
          (o) => o.shortcutKey === String(digit),
        );
        if (targetOption) {
          e.preventDefault();
          setSelectedOptionId(targetOption.id);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    disabled,
    isSubmitting,
    prompt.options,
    prompt.allowSkip,
    isCustomActive,
    customText,
    selectedOptionId,
    handleFinalSubmit,
    handleSkip,
  ]);

  const canSubmit = isCustomActive ? customText.trim().length > 0 : Boolean(activeOption);

  const HeaderIcon = prompt.codeSnippet
    ? Terminal
    : prompt.title.toLowerCase().includes("allow") ||
        prompt.title.toLowerCase().includes("onay")
      ? ShieldAlert
      : HelpCircle;

  return (
    <div ref={containerRef} tabIndex={-1} className="relative mx-auto w-full max-w-3xl shrink-0 px-3 pb-2 pt-1.5 focus:outline-none">
      <div className="overflow-hidden rounded-xl border border-border/80 bg-background/95 backdrop-blur-md shadow-lg transition-all">
        {/* Header Bar */}
        <div className="flex items-center gap-2 border-b border-border/40 bg-muted/20 px-3 py-2 select-none">
          <HeaderIcon className="size-4 shrink-0 text-amber-500" />
          <div className="flex flex-col min-w-0">
            <span className="text-[12.5px] font-semibold text-foreground leading-tight truncate">
              {prompt.title}
            </span>
            {prompt.description ? (
              <span className="text-[11px] text-muted-foreground truncate">
                {prompt.description}
              </span>
            ) : null}
          </div>
        </div>

        <div className="space-y-2 p-3">
          {/* Monospaced Code Snippet / Context Box */}
          {prompt.codeSnippet ? (
            <div className="rounded-lg border border-border/60 bg-muted/40 p-2.5 font-mono text-[11px] leading-relaxed text-foreground/90 select-text overflow-x-auto whitespace-pre-wrap max-h-36">
              {prompt.codeSnippet}
            </div>
          ) : null}

          {/* Numbered Options List */}
          <div className="space-y-1.5" role="radiogroup">
            {prompt.options.map((opt) => {
              const isSelected = opt.id === selectedOptionId;
              return (
                <div
                  key={opt.id}
                  data-option-id={opt.id}
                  onClick={() => handleSelectOption(opt)}
                  className={cn(
                    "flex flex-col gap-1 rounded-lg border p-2 cursor-pointer transition-colors text-left",
                    isSelected
                      ? "border-primary bg-primary/10 shadow-xs ring-1 ring-primary/40 dark:bg-primary/15"
                      : "border-border/50 bg-background hover:bg-muted/40 hover:border-border",
                    (disabled || isSubmitting) && "opacity-60 cursor-not-allowed",
                  )}
                >
                  <div className="flex items-center gap-2.5">
                    {/* Number Badge (1, 2, 3...) */}
                    {opt.shortcutKey ? (
                      <span
                        className={cn(
                          "size-5 rounded-full flex items-center justify-center text-[10.5px] font-mono font-semibold shrink-0 transition-colors",
                          isSelected
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground border border-border/60",
                        )}
                      >
                        {opt.shortcutKey}
                      </span>
                    ) : (
                      <span
                        className={cn(
                          "size-2 rounded-full shrink-0 ml-1.5 mr-1",
                          isSelected ? "bg-primary" : "bg-muted-foreground/40",
                        )}
                      />
                    )}

                    <div className="flex flex-col min-w-0 flex-1">
                      <span className="text-[12px] font-medium text-foreground leading-snug">
                        {opt.label}
                      </span>
                      {opt.description ? (
                        <span className="text-[11px] text-muted-foreground leading-tight">
                          {opt.description}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  {/* Inline Textarea for Custom Input */}
                  {opt.isCustomInput && isSelected ? (
                    <div
                      className="mt-1 pl-7 pr-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <textarea
                        ref={customInputRef}
                        value={customText}
                        onChange={(e) => setCustomText(e.target.value)}
                        placeholder={
                          prompt.customPlaceholder ||
                          "Ajanı nasıl yönlendirmek istediğinizi yazın..."
                        }
                        rows={2}
                        className="w-full resize-none rounded-md border border-border/70 bg-background p-2 text-[11.5px] text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-1 focus:ring-primary"
                        disabled={disabled}
                      />
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between border-t border-border/40 bg-muted/10 px-3 py-2">
          <div className="flex items-center gap-2">
            {prompt.allowSkip ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleSkip}
                disabled={disabled || isSubmitting}
                className="h-7 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
              >
                Skip
              </Button>
            ) : null}
            <span className="text-[10px] text-muted-foreground/60 font-mono hidden sm:inline">
              1-9 tuşla · ↑↓ gezin · ↵ onayla
            </span>
          </div>

          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={handleFinalSubmit}
            disabled={disabled || isSubmitting || !canSubmit}
            className="h-7 gap-1 px-3 text-xs font-medium cursor-pointer"
          >
            <span>Submit</span>
            <CornerDownLeft className="size-3 shrink-0" />
          </Button>
        </div>
      </div>
    </div>
  );
}
