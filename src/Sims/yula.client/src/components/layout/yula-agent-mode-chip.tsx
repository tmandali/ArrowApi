"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useOptionalYulaChat } from "@/hooks/use-yula-chat";
import { REGISTERED_REPORTS } from "@/features/reports/report-registry";
import { formatPathnameLabel, isWorkspaceHomePath } from "@/lib/workspace-paths";
import { yulaToolPartInfo } from "@/lib/yula-tool-info";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/utils/cn";
import { Brain, Cpu, ListOrdered, Sparkles, Zap, ArrowRight } from "lucide-react";

export type YulaAgentModeChipProps = {
  className?: string;
};

export function YulaAgentModeChip({ className }: YulaAgentModeChipProps) {
  const t = useTranslations("AiDock");
  const pathname = usePathname();
  const chat = useOptionalYulaChat();
  const [popoverOpen, setPopoverOpen] = React.useState(false);

  const isHome = isWorkspaceHomePath(pathname) || pathname === "/";
  const activeReport = React.useMemo(
    () => REGISTERED_REPORTS.find((r) => pathname.startsWith(r.pagePath)),
    [pathname],
  );
  const screenTitle = activeReport?.title ?? formatPathnameLabel(pathname);

  // 1. Canlı tur durumu (Reasoning vs Acting)
  const isTurnActive = Boolean(chat?.isTurnActive);

  const lastAssistantMsg = React.useMemo(() => {
    if (!chat?.messages) return null;
    for (let i = chat.messages.length - 1; i >= 0; i--) {
      if (chat.messages[i].role === "assistant") return chat.messages[i];
    }
    return null;
  }, [chat?.messages]);

  const activeToolInfo = React.useMemo(() => {
    if (!isTurnActive || !lastAssistantMsg?.parts) return null;
    for (const part of lastAssistantMsg.parts) {
      const info = yulaToolPartInfo(part);
      if (
        info &&
        (info.state === "input-available" ||
          info.state === "input-streaming" ||
          info.state === "call")
      ) {
        return info;
      }
    }
    return null;
  }, [isTurnActive, lastAssistantMsg]);

  // 2. /plan komutu oturumda çalıştırıldı mı kontrolü
  const isPlanCommandActive = React.useMemo(() => {
    if (!chat?.messages) return false;
    for (let i = chat.messages.length - 1; i >= 0; i--) {
      const msg = chat.messages[i];
      const text =
        msg.parts
          ?.filter((p) => p.type === "text")
          .map((p: any) => p.text)
          .join(" ") || "";
      if (
        text.includes("Planlama Modu Aktif") ||
        text.includes("Planning Mode Active") ||
        text.startsWith("/plan")
      ) {
        return true;
      }
      if (
        text.includes("[DONE:") ||
        text.includes("Planı Başlat ve İcra Et") ||
        text.includes("Start and Execute Plan")
      ) {
        return false;
      }
    }
    return false;
  }, [chat?.messages]);

  // 3. Mod kararı:
  // Canlı akışta: Acting vs Reasoning
  // Boşta (Idle): ReAct (ekran içi) vs Plan (ekran dışı veya /plan aktif)
  const isActing = isTurnActive && Boolean(activeToolInfo);
  const isReasoning = isTurnActive && !isActing;
  const isPlanMode = isHome || !screenTitle || isPlanCommandActive;

  // Rozet görsel ve metin yapılandırması
  let badgeLabel: string;
  let badgeTooltip: string;
  let badgeClass: string;
  let badgeIcon: React.ReactNode;

  if (isActing) {
    const actionLabel =
      activeToolInfo?.input && typeof activeToolInfo.input === "object"
        ? (activeToolInfo.input as { action?: string }).action
        : activeToolInfo?.toolName;
    badgeLabel = t("mode_acting");
    badgeTooltip = t("mode_acting_desc", { action: actionLabel || "UI" });
    badgeClass =
      "border-cyan-500/40 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 animate-pulse";
    badgeIcon = <Cpu className="size-2.5 shrink-0 text-cyan-500 animate-pulse" />;
  } else if (isReasoning) {
    badgeLabel = t("mode_reasoning");
    badgeTooltip = t("mode_reasoning_desc");
    badgeClass =
      "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300 animate-pulse";
    badgeIcon = <Sparkles className="size-2.5 shrink-0 text-amber-500 animate-spin" />;
  } else if (isPlanMode) {
    badgeLabel = t("mode_plan");
    badgeTooltip = t("mode_plan_title");
    badgeClass =
      "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300 hover:bg-violet-500/20";
    badgeIcon = <ListOrdered className="size-2.5 shrink-0 text-violet-600 dark:text-violet-400" />;
  } else {
    badgeLabel = t("mode_react");
    badgeTooltip = t("mode_react_title");
    badgeClass =
      "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20";
    badgeIcon = <Zap className="size-2.5 shrink-0 text-emerald-600 dark:text-emerald-400" />;
  }

  const handleSwitchToPlan = () => {
    chat?.sendMessageText("/plan");
    setPopoverOpen(false);
  };

  return (
    <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex h-5 shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10.5px] font-medium tracking-tight transition-all select-none cursor-pointer",
            badgeClass,
            className,
          )}
          title={badgeTooltip}
          aria-label={badgeTooltip}
        >
          {badgeIcon}
          <span className="font-semibold">{badgeLabel}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-3 text-xs shadow-lg">
        <div className="space-y-2.5">
          {/* Başlık ve Aktif Durum */}
          <div className="flex items-center justify-between border-b pb-2">
            <div className="flex items-center gap-1.5 font-semibold text-foreground">
              {isPlanMode ? (
                <ListOrdered className="size-4 text-violet-500" />
              ) : (
                <Zap className="size-4 text-emerald-500" />
              )}
              <span>{isPlanMode ? t("mode_plan_title") : t("mode_react_title")}</span>
            </div>
            <span
              className={cn(
                "rounded px-1.5 py-0.5 text-[10px] font-medium",
                isTurnActive
                  ? "bg-amber-500/15 text-amber-700 dark:text-amber-300 animate-pulse"
                  : isPlanMode
                    ? "bg-violet-500/15 text-violet-700 dark:text-violet-300"
                    : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
              )}
            >
              {isTurnActive
                ? isActing
                  ? t("mode_acting")
                  : t("mode_reasoning")
                : badgeLabel}
            </span>
          </div>

          {/* Açıklama */}
          <p className="text-muted-foreground leading-relaxed">
            {isPlanMode
              ? t("mode_plan_desc")
              : t("mode_react_desc", { screen: screenTitle || "Ekran" })}
          </p>

          {/* Canlı Eylem Detayı (Turn Sırasında) */}
          {isTurnActive ? (
            <div className="rounded-md border border-amber-500/20 bg-amber-500/5 p-2 text-[11px] space-y-1">
              <div className="flex items-center gap-1.5 font-medium text-amber-700 dark:text-amber-300">
                <Brain className="size-3.5 animate-pulse" />
                <span>
                  {isActing ? t("mode_acting") : t("mode_reasoning")}
                </span>
              </div>
              <p className="text-muted-foreground">
                {isActing
                  ? t("mode_acting_desc", {
                      action:
                        (activeToolInfo?.input as any)?.action ||
                        activeToolInfo?.toolName ||
                        "İşlem",
                    })
                  : t("mode_reasoning_desc")}
              </p>
            </div>
          ) : null}

          {/* ReAct Döngüsü Bilgilendirme Kutusu */}
          <div className="rounded-md bg-muted/50 p-2 text-[11px] space-y-1.5">
            <div className="font-semibold text-foreground flex items-center gap-1">
              <Sparkles className="size-3 text-primary" />
              <span>{t("mode_popover_loop_title")}</span>
            </div>
            <div className="space-y-1 text-muted-foreground">
              <div className="flex items-start gap-1.5">
                <span className="text-amber-600 dark:text-amber-400 font-bold">🧠</span>
                <span>{t("mode_popover_reasoning_item")}</span>
              </div>
              <div className="flex items-start gap-1.5">
                <span className="text-emerald-600 dark:text-emerald-400 font-bold">⚡</span>
                <span>{t("mode_popover_acting_item")}</span>
              </div>
            </div>
          </div>

          {/* Plan Modu Kısayolu */}
          {!isPlanMode && chat ? (
            <div className="pt-1 border-t flex flex-col gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full justify-between h-7 text-xs font-normal text-muted-foreground hover:text-foreground"
                onClick={handleSwitchToPlan}
              >
                <span>{t("mode_switch_to_plan")}</span>
                <ArrowRight className="size-3" />
              </Button>
              <span className="text-[10px] text-muted-foreground/80 text-center">
                {t("mode_switch_plan_hint")}
              </span>
            </div>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}
