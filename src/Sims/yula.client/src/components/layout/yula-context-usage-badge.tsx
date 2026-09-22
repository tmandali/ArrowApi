"use client";

import * as React from "react";
import { useFormatter, useTranslations } from "next-intl";
import { useOptionalYulaChat } from "@/hooks/use-yula-chat";
import { useChatsStore } from "@/lib/stores/chats";
import {
  useYulaAiConfig,
  writeYulaClientAiConfig,
  fetchCachedYulaModels,
} from "@/lib/yula-ai-client-config";
import { DEFAULT_AUTHORIZED_MODELS } from "@/components/layout/yula-commands";
import type { YulaEffort } from "@/lib/yula-reasoning";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/utils/cn";
import { Brain, Download, Layers, Loader2, Sparkles, Zap } from "lucide-react";

export type YulaContextUsageBadgeProps = {
  className?: string;
};

export function YulaContextUsageBadge({ className }: YulaContextUsageBadgeProps) {
  const t = useTranslations("AiDock");
  const format = useFormatter();
  const chat = useOptionalYulaChat();
  const activeId = useChatsStore((s) => s.activeId);
  const shortNo = activeId
    ? (activeId.split("-").pop() || activeId).slice(-6).toUpperCase()
    : null;
  const dumpSession = chat?.dumpSession;
  const contextUsage = chat?.contextUsage;
  const autoCompactEnabled = chat?.autoCompactEnabled ?? true;
  const setAutoCompactEnabled = chat?.setAutoCompactEnabled;
  const isCompacting = chat?.isCompacting ?? false;
  const compact = chat?.compact;
  const messagesCount = chat?.messages?.length ?? 0;

  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    const handleOpen = () => setOpen(true);
    window.addEventListener("yula:open-context-window", handleOpen);
    return () => window.removeEventListener("yula:open-context-window", handleOpen);
  }, []);

  const aiConfig = useYulaAiConfig();
  const chatsModel = useChatsStore((s) => s.model);
  const isThinkingEnabled = useChatsStore((s) => s.isThinkingEnabled);
  const currentModelId = chatsModel || aiConfig.model || "gpt-5.4";
  const currentThinking = aiConfig.thinking !== undefined ? aiConfig.thinking : isThinkingEnabled;
  const currentEffort: YulaEffort = aiConfig.effort ?? (currentThinking ? "low" : "off");

  const [modelsList, setModelsList] = React.useState<
    Array<{
      id: string;
      name: string;
      provider: string;
      providerLabel?: string;
      hasThinking?: boolean;
      isConfigured?: boolean;
    }>
  >(DEFAULT_AUTHORIZED_MODELS);

  React.useEffect(() => {
    let active = true;
    void fetchCachedYulaModels().then((res) => {
      if (active && res?.allModels && res.allModels.length > 0) {
        setModelsList(res.allModels);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const uniqueModelsList = React.useMemo(() => {
    const seen = new Set<string>();
    return modelsList.filter((m) => {
      const norm = (m.id || m.name || "").toLowerCase();
      if (!norm || seen.has(norm)) return false;
      seen.add(norm);
      return true;
    });
  }, [modelsList]);

  const activeModelInfo = React.useMemo(() => {
    const norm = currentModelId.toLowerCase();
    return (
      uniqueModelsList.find(
        (m) => m.id.toLowerCase() === norm || m.name.toLowerCase() === norm,
      ) ?? {
        id: currentModelId,
        name: currentModelId,
        provider: aiConfig.provider || "azure",
        providerLabel: aiConfig.provider || "Azure",
        hasThinking: true,
      }
    );
  }, [uniqueModelsList, currentModelId, aiConfig.provider]);

  const supportsThinking = activeModelInfo.hasThinking !== false;

  const handleModelChange = (newModelId: string) => {
    const found = uniqueModelsList.find((m) => m.id === newModelId);
    useChatsStore.getState().setModel(newModelId);
    writeYulaClientAiConfig({
      model: newModelId,
      ...(found?.provider ? { provider: found.provider as any } : {}),
    });
  };

  const handleThinkingToggle = (enabled: boolean) => {
    useChatsStore.getState().setThinkingEnabled(enabled);
    writeYulaClientAiConfig({ thinking: enabled });
  };

  const handleEffortChange = (level: YulaEffort) => {
    writeYulaClientAiConfig({ effort: level });
  };

  const percent = contextUsage?.percent ?? 0;
  const tokens = contextUsage?.tokens ?? 0;
  const contextWindow = contextUsage?.contextWindow ?? 128000;
  const formattedWindow = `${Math.round(contextWindow / 1000)}k`;

  const isCritical = percent > 90;
  const isWarning = percent > 70;

  const statusBadgeClass = isCritical
    ? "text-destructive border-destructive/30 bg-destructive/10 hover:bg-destructive/15"
    : isWarning
      ? "text-amber-600 dark:text-amber-400 border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/15"
      : "text-muted-foreground border-border/50 bg-muted/40 hover:bg-muted hover:text-foreground";

  const progressIndicatorClass = isCritical
    ? "[&>[data-slot=progress-indicator]]:bg-destructive"
    : isWarning
      ? "[&>[data-slot=progress-indicator]]:bg-amber-500"
      : "[&>[data-slot=progress-indicator]]:bg-primary";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          suppressHydrationWarning
          className={cn(
            "flex h-6 items-center gap-1.5 rounded-md border px-2 font-mono text-[10.5px] font-medium transition-colors select-none shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
            statusBadgeClass,
            className,
          )}
          title={
            activeId
              ? `#${shortNo} (${activeId}) — ${t("context_tooltip", {
                  used: format.number(tokens),
                  total: format.number(contextWindow),
                })}`
              : t("context_tooltip", {
                  used: format.number(tokens),
                  total: format.number(contextWindow),
                })
          }
          aria-label={t("context_title")}
        >
          {isCompacting ? (
            <>
              <Loader2 className="size-2.5 animate-spin text-amber-500 shrink-0" />
              <span className="text-[9.5px]">{t("context_compacting")}</span>
            </>
          ) : (
            <>
              <Layers className="size-3 shrink-0 opacity-70" />
              {shortNo ? (
                <>
                  <span className="font-semibold text-foreground/80 tracking-tight">
                    #{shortNo}
                  </span>
                  <span className="text-border/60">·</span>
                </>
              ) : null}
              <span>{percent.toFixed(0)}%</span>
              <span className="text-border/60">/</span>
              <span>{formattedWindow}</span>
              <span className="ml-0.5 rounded px-1 py-0.2 text-[8.5px] font-sans font-semibold uppercase tracking-wider text-muted-foreground/80 bg-background/50 border border-border/40">
                {autoCompactEnabled ? "auto" : "man"}
              </span>
            </>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-3.5 space-y-3">
        {/* Başlık ve Doluluk Yüzdesi + JSON Dump */}
        <div className="flex items-center justify-between border-b pb-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <Layers className="size-3.5 text-muted-foreground shrink-0" />
            <span className="font-semibold text-xs text-foreground truncate">
              {t("context_title")}
            </span>
            {shortNo ? (
              <span
                className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] font-medium text-muted-foreground shrink-0"
                title={activeId ?? undefined}
              >
                #{shortNo}
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-6 text-muted-foreground hover:text-foreground rounded"
              onClick={() => dumpSession?.()}
              title={t("context_dump_session")}
              aria-label={t("context_dump_session")}
            >
              <Download className="size-3.5" />
            </Button>
            <span
              className={cn(
                "font-mono font-bold text-[11px] px-1.5 py-0.5 rounded border",
                isCritical
                  ? "text-destructive bg-destructive/10 border-destructive/20"
                  : isWarning
                    ? "text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/20"
                    : "text-foreground/90 bg-muted/60 border-border/50",
              )}
            >
              %{percent.toFixed(1)}
            </span>
          </div>
        </div>

        {/* Doluluk Çubuğu ve Token Detayları */}
        <div className="space-y-1.5">
          <Progress
            value={Math.min(100, Math.max(0, percent))}
            className={cn("h-1.5 bg-muted", progressIndicatorClass)}
          />
          <div className="flex items-center justify-between text-[10.5px] text-muted-foreground font-mono">
            <span>{format.number(tokens)} tok</span>
            <span>{format.number(contextWindow)} tok</span>
          </div>
        </div>

        {/* Model, Düşünme ve Efor Ayarları */}
        <div className="space-y-2.5 pt-2 border-t text-xs">
          {/* Model Seçimi */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px] font-medium text-muted-foreground">
              <span>{t("context_model_label")}</span>
              <span className="text-[10px] font-mono px-1 py-0.2 rounded bg-muted/70 text-muted-foreground">
                {activeModelInfo.providerLabel || activeModelInfo.provider}
              </span>
            </div>
            <Select value={currentModelId} onValueChange={handleModelChange}>
              <SelectTrigger className="h-8 text-xs font-medium w-full">
                <SelectValue placeholder={currentModelId} />
              </SelectTrigger>
              <SelectContent className="max-h-56">
                {uniqueModelsList.map((m) => (
                  <SelectItem key={m.id} value={m.id} className="text-xs">
                    <span className="flex items-center justify-between gap-2 w-full">
                      <span className="truncate">{m.name}</span>
                      <span className="text-[10px] text-muted-foreground/70 font-mono">
                        {m.providerLabel || m.provider}
                      </span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Düşünme (Thinking) Toggle */}
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-muted-foreground text-[11.5px]">
              <Brain className="size-3.5 text-primary/80 shrink-0" />
              <span>{t("context_thinking_label")}</span>
            </span>
            {supportsThinking ? (
              <div className="inline-flex rounded-md border border-border/50 bg-muted/30 p-0.5 text-[10.5px]">
                <button
                  type="button"
                  onClick={() => handleThinkingToggle(true)}
                  className={cn(
                    "rounded px-2 py-0.5 font-medium transition-colors cursor-pointer",
                    currentThinking
                      ? "bg-primary text-primary-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t("context_auto_on")}
                </button>
                <button
                  type="button"
                  onClick={() => handleThinkingToggle(false)}
                  className={cn(
                    "rounded px-2 py-0.5 font-medium transition-colors cursor-pointer",
                    !currentThinking
                      ? "bg-muted-foreground/30 text-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t("context_auto_off")}
                </button>
              </div>
            ) : (
              <span className="text-[10px] text-muted-foreground/60 italic">
                {t("context_effort_unsupported")}
              </span>
            )}
          </div>

          {/* Düşünme Eforu (Reasoning Effort) */}
          {supportsThinking && currentThinking ? (
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Sparkles className="size-3 text-amber-500/80 shrink-0" />
                <span>{t("context_effort_label")}</span>
              </div>
              <div className="grid grid-cols-4 gap-1">
                {(["off", "low", "medium", "high"] as const).map((lvl) => {
                  const isActive = currentEffort === lvl;
                  const labelKey = `context_effort_${lvl}` as const;
                  return (
                    <button
                      key={lvl}
                      type="button"
                      onClick={() => handleEffortChange(lvl)}
                      className={cn(
                        "h-6 rounded border text-[10.5px] font-medium transition-colors cursor-pointer text-center",
                        isActive
                          ? "border-primary/50 bg-primary/10 text-primary font-semibold"
                          : "border-border/40 bg-muted/20 text-muted-foreground hover:bg-muted hover:text-foreground",
                      )}
                    >
                      {t(labelKey)}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>

        {/* Ayarlar ve Aksiyonlar */}
        <div className="space-y-2 pt-2 border-t">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">
              {t("context_auto_compact")}
            </span>
            <button
              type="button"
              onClick={() => setAutoCompactEnabled?.(!autoCompactEnabled)}
              className={cn(
                "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors border select-none cursor-pointer",
                autoCompactEnabled
                  ? "bg-primary/10 text-primary border-primary/20 hover:bg-primary/15"
                  : "bg-muted text-muted-foreground border-border/40 hover:bg-muted/80 hover:text-foreground",
              )}
            >
              {autoCompactEnabled ? (
                <>
                  <Zap className="size-3 fill-current" />
                  <span>{t("context_auto_on")}</span>
                </>
              ) : (
                <span>{t("context_auto_off")}</span>
              )}
            </button>
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full text-xs h-8 gap-1.5 font-medium"
            disabled={messagesCount <= 1 || isCompacting}
            onClick={async () => {
              if (compact) {
                await compact();
                setOpen(false);
              }
            }}
          >
            {isCompacting ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                <span>{t("context_compacting")}</span>
              </>
            ) : (
              <>
                <Sparkles className="size-3.5 text-muted-foreground" />
                <span>{t("context_compact_now")}</span>
              </>
            )}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
