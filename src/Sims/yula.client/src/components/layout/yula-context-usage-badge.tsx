"use client"

import * as React from "react"
import { useFormatter, useTranslations } from "next-intl"
import { useOptionalYulaChat } from "@/hooks/use-yula-chat"
import { useChatsStore } from "@/lib/stores/chats"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/utils/cn"
import { Download, Layers, Loader2, Sparkles, Zap } from "lucide-react"

export type YulaContextUsageBadgeProps = {
  className?: string
}

export function YulaContextUsageBadge({ className }: YulaContextUsageBadgeProps) {
  const t = useTranslations("AiDock")
  const format = useFormatter()
  const chat = useOptionalYulaChat()
  const activeId = useChatsStore((s) => s.activeId)
  const shortNo = activeId
    ? (activeId.split("-").pop() || activeId).slice(-6).toUpperCase()
    : null
  const dumpSession = chat?.dumpSession
  const contextUsage = chat?.contextUsage
  const autoCompactEnabled = chat?.autoCompactEnabled ?? true
  const setAutoCompactEnabled = chat?.setAutoCompactEnabled
  const isCompacting = chat?.isCompacting ?? false
  const compact = chat?.compact
  const messagesCount = chat?.messages?.length ?? 0

  const [open, setOpen] = React.useState(false)

  const percent = contextUsage?.percent ?? 0
  const tokens = contextUsage?.tokens ?? 0
  const contextWindow = contextUsage?.contextWindow ?? 128000
  const formattedWindow = `${Math.round(contextWindow / 1000)}k`

  const isCritical = percent > 90
  const isWarning = percent > 70

  const statusBadgeClass = isCritical
    ? "text-destructive border-destructive/30 bg-destructive/10 hover:bg-destructive/15"
    : isWarning
      ? "text-amber-600 dark:text-amber-400 border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/15"
      : "text-muted-foreground border-border/50 bg-muted/40 hover:bg-muted hover:text-foreground"

  const progressIndicatorClass = isCritical
    ? "[&>[data-slot=progress-indicator]]:bg-destructive"
    : isWarning
      ? "[&>[data-slot=progress-indicator]]:bg-amber-500"
      : "[&>[data-slot=progress-indicator]]:bg-primary"

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          suppressHydrationWarning
          className={cn(
            "flex h-6 items-center gap-1.5 rounded-md border px-2 font-mono text-[10.5px] font-medium transition-colors select-none shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
            statusBadgeClass,
            className
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
      <PopoverContent align="end" className="w-72 p-3.5 space-y-3">
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
                    : "text-foreground/90 bg-muted/60 border-border/50"
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

        {/* Ayarlar ve Aksiyonlar */}
        <div className="space-y-2 pt-1 border-t">
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
                  : "bg-muted text-muted-foreground border-border/40 hover:bg-muted/80 hover:text-foreground"
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
                await compact()
                setOpen(false)
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
  )
}
