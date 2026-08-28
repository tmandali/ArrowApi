"use client";

import { useRouter } from "next/navigation";
import * as React from "react"
import type { YulaMessage } from "@/app/api/agent/chat/route"
import { Brain, ChevronDown, Wrench, Zap } from "lucide-react"

import { useYulaChat } from "@/hooks/use-yula-chat"
import { useActiveJobsStore } from "@/store/slices/active-jobs-store"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { cn } from "@/utils/cn"
import { useYulaGridStore } from "@/lib/stores/grid"
import { ChatMarkdown, FileOpenChip } from "./chat-markdown"


type AiChatMessageProps = {
  message: YulaMessage
  /** Sohbetin en sonki asistan mesajı — düşünme bloğu canlı davranış (açık başlar, cevap bitince katlanır). */
  isLive?: boolean
  className?: string
}

const REASONING_META: Record<string, { label: string; icon: typeof Brain; iconColor: string; borderColor: string }> = {
  "tool-args": {
    label: "Araç Parametreleri",
    icon: Wrench,
    iconColor: "text-sky-500/80 dark:text-sky-400/80",
    borderColor: "border-sky-500/30 dark:border-sky-400/30",
  },
  "tool-exec": {
    label: "Araç Çalıştırma",
    icon: Wrench,
    iconColor: "text-sky-500/80 dark:text-sky-400/80",
    borderColor: "border-sky-500/30 dark:border-sky-400/30",
  },
  "tool-exec-error": {
    label: "Araç Çalıştırma (Hata)",
    icon: Wrench,
    iconColor: "text-red-500/80 dark:text-red-400/80",
    borderColor: "border-red-500/40 dark:border-red-400/40",
  },
  "tool-result": {
    label: "Araç Sonucu",
    icon: Zap,
    iconColor: "text-emerald-500/80 dark:text-emerald-400/80",
    borderColor: "border-emerald-500/30 dark:border-emerald-400/30",
  },
  thinking: {
    label: "Düşünme Süreci",
    icon: Brain,
    iconColor: "text-orange-500/80 dark:text-orange-400/80",
    borderColor: "border-orange-500/30 dark:border-orange-400/30",
  },
}

function ReasoningPart({ text, isLive, meta }: { text: string; isLive?: boolean; meta?: string }) {
  const { busy: isProcessing } = useYulaChat()
  const [open, setOpen] = React.useState(Boolean(isLive))
  const [userToggled, setUserToggled] = React.useState(false)

  // Güncel mesajda düşünme hemen görünür; cevaplama tamamlanınca otomatik katlanır
  React.useEffect(() => {
    if (!isLive || isProcessing || userToggled) return
    const timer = setTimeout(() => setOpen(false), 1500)
    return () => clearTimeout(timer)
  }, [isLive, isProcessing, userToggled])

  if (!text.trim()) return null

  const cfg = REASONING_META[meta || "thinking"] || REASONING_META.thinking
  const Icon = cfg.icon

  return (
    <Collapsible
      open={open}
      onOpenChange={(value) => {
        setUserToggled(true)
        setOpen(value)
      }}
      className="space-y-1.5"
    >
      <CollapsibleTrigger className="group/reasoning flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground">
        <Icon className={cn("size-3.5 shrink-0", cfg.iconColor)} />
        {cfg.label}
        <ChevronDown className="size-3 shrink-0 transition-transform duration-200 group-data-[state=open]/reasoning:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div
          className={cn(
            "border-l-2 pl-3 text-[11px] leading-relaxed whitespace-pre-wrap break-words text-muted-foreground",
            cfg.borderColor
          )}
        >
          {text}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

function FormattedAssistantText({
  text,
  message,
}: {
  text: string
  message?: YulaMessage
}) {
  const router = useRouter();
  const navigate = (
    to: string | number,
    _options?: { replace?: boolean; state?: unknown },
  ) => {
    if (typeof to === "number") {
      if (to < 0) router.back();
      else router.forward();
    } else {
      void router.push(to);
    }
  };

  const { sendMessageText: sendPrompt } = useYulaChat()

  // Mesajın tüm parçalarını (reasoning + text) ve tool verilerini birleştirerek kontrol et.
  // DİKKAT: injected reasoning detayları ("Sonuç:\n{...}") onay tespitini kirletir → dışlanır.
  const fullContextText = React.useMemo(() => {
    const partsText =
      message?.parts
        ?.filter((p: any) => p?.type !== "reasoning")
        .map((p: any) => (typeof p.text === "string" ? p.text : JSON.stringify(p)))
        .join("\n") || ""
    return `${partsText}\n${text}`
  }, [message, text])

  const pagePathMatch =
    fullContextText.match(/"pagePath"\s*:\s*"([^"]+)"/) ||
    fullContextText.match(/pagePath:\s*"?([^"\s\n]+)"?/)

  const fullUuidMatch =
    fullContextText.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)

  const shortUuidMatch =
    fullContextText.match(/\(([0-9a-f]{8})\.\.\.\)/i) ||
    fullContextText.match(/\b([0-9a-f]{8})\b/i)

  const isExecutionConfirmation =
    fullContextText.startsWith("✓") ||
    fullContextText.startsWith("📊") ||
    fullContextText.startsWith("⚡") ||
    text.startsWith("✓") ||
    text.startsWith("📊") ||
    text.startsWith("⚡") ||
    fullContextText.includes("Report Started") ||
    fullContextText.includes("başarıyla uygulandı") ||
    fullContextText.includes("uygulandı.") ||
    fullContextText.includes("hazırlanmış güncel rapor bulundu") ||
    fullContextText.includes("Sonuç:") ||
    Boolean(pagePathMatch || fullUuidMatch)

  const navigateToReportOrJob = (reportNameOrTitle?: string) => {
    if (pagePathMatch) {
      navigate(pagePathMatch[1])
      return true
    }

    const jobs = Object.values(useActiveJobsStore.getState().jobs)
    if (fullUuidMatch) {
      const uuid = fullUuidMatch[0]
      const targetJob = jobs.find((j) => j.id.toLowerCase() === uuid.toLowerCase())
      if (targetJob?.href) {
        navigate(targetJob.href)
        return true
      }
      if (
        /stok analitik/i.test(reportNameOrTitle || "") ||
        fullContextText.toLowerCase().includes("stock-analytics") ||
        fullContextText.toLowerCase().includes("stok analitik")
      ) {
        navigate(`/stock/stock-analytics/${uuid}`)
        return true
      }
      navigate(`/stock/stock-balance/${uuid}`)
      return true
    }

    if (shortUuidMatch) {
      const shortId = shortUuidMatch[1]
      const targetJob = jobs.find((j) => j.id.toLowerCase().startsWith(shortId.toLowerCase()))
      if (targetJob?.href) {
        navigate(targetJob.href)
        return true
      }
      if (
        /stok analitik/i.test(reportNameOrTitle || "") ||
        fullContextText.toLowerCase().includes("stock-analytics") ||
        fullContextText.toLowerCase().includes("stok analitik")
      ) {
        navigate(`/stock/stock-analytics/${shortId}`)
        return true
      }
      navigate(`/stock/stock-balance/${shortId}`)
      return true
    }

    // Eğer bu bir onay/başlatma mesajıysa ve store'da güncel bir iş varsa ona git
    if (isExecutionConfirmation && jobs.length > 0) {
      const isAnalytics =
        /stok analitik/i.test(reportNameOrTitle || "") ||
        fullContextText.toLowerCase().includes("stock-analytics") ||
        fullContextText.toLowerCase().includes("stok analitik")

      const matchingJob = jobs
        .filter((j) => (isAnalytics ? /stock-analytics|analitik/i.test(j.href || j.name || j.title) : /stock-balance|bakiye/i.test(j.href || j.name || j.title)))
        .sort((a, b) => Date.parse(b.createdAt || "") - Date.parse(a.createdAt || ""))[0]

      if (matchingJob?.href) {
        navigate(matchingJob.href)
        return true
      }
    }

    return false
  }

  const columns = useYulaGridStore.getState().spec?.columns ?? []

  return (
    <div className="max-w-[96%] text-[12px] text-foreground/90">
      <ChatMarkdown
        text={text}
        isExecutionConfirmation={isExecutionConfirmation}
        columns={columns}
        onPrompt={sendPrompt}
        onNavigateReport={navigateToReportOrJob}
      />
    </div>
  )
}

function TextPart({
  text,
  role,
  message,
}: {
  text: string
  role: YulaMessage["role"]
  message?: YulaMessage
}) {
  if (!text) return null

  // Skill çıktısı dosya token'ı: [[file:<mutlak yol>|<etiket>]] → tıkla & varsayılan uygulamada aç
  const FILE_TOKEN = /\[\[file:(.+?)\|(.+?)\]\]/g
  if (role !== "user" && FILE_TOKEN.test(text)) {
    FILE_TOKEN.lastIndex = 0
    const segments: Array<{ type: "text" | "file"; value: string; path?: string }> = []
    let last = 0
    for (const m of text.matchAll(FILE_TOKEN)) {
      if (m.index! > last) segments.push({ type: "text", value: text.slice(last, m.index) })
      segments.push({ type: "file", value: m[2], path: m[1] })
      last = m.index! + m[0].length
    }
    if (last < text.length) segments.push({ type: "text", value: text.slice(last) })

    return (
      <div className="text-[12px] leading-relaxed">
        {segments.map((seg, i) =>
          seg.type === "file" && seg.path ? (
            <FileOpenChip key={i} path={seg.path} label={seg.value} />
          ) : (
            <span key={i}>{seg.value}</span>
          )
        )}
      </div>
    )
  }

  if (role === "user") {
    return (
      <div className="ml-auto flex items-center max-w-[88%]">
        <div className="rounded-xl bg-muted px-2.5 py-2 text-[12px] leading-relaxed text-foreground">
          {text}
        </div>
      </div>
    )
  }

  return <FormattedAssistantText text={text} message={message} />
}

/** Avatar-free message row — user bubble right, assistant text + reasoning left. */
export function AiChatMessage({
  message,
  isLive,
  className,
}: AiChatMessageProps) {
  const isUser = message.role === "user"

  return (
    <div
      className={cn(
        "flex w-full flex-col gap-1.5",
        isUser ? "items-end" : "items-start",
        className
      )}
    >
      {message.parts?.map((part, index) => {
        if (part.type === "reasoning") {
          const meta = (part as { meta?: string }).meta
          return (
            <ReasoningPart
              key={`${message.id}-r-${index}`}
              text={part.text}
              isLive={isLive}
              meta={meta}
            />
          )
        }
        if (part.type === "text") {
          return (
            <TextPart
              key={`${message.id}-t-${index}`}
              text={part.text}
              role={message.role}
              message={message}
            />
          )
        }
        return null
      })}
    </div>
  )
}
