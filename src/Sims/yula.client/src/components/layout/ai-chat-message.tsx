"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import type { YulaMessage } from "@/app/api/agent/chat/route";
import { useYulaChat } from "@/hooks/use-yula-chat";
import { useActiveJobsStore } from "@/store/slices/active-jobs-store";
import { cn } from "@/utils/cn";
import { useYulaGridStore } from "@/lib/stores/grid";
import { ChatMarkdown, FileOpenChip } from "./chat-markdown";
import { sanitizeAssistantText } from "@/lib/sanitize-assistant-text";

type AiChatMessageProps = {
  message: YulaMessage;
  isLive?: boolean;
  className?: string;
};

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
  const displayText =
    role === "user" ? text : sanitizeAssistantText(text)
  if (role !== "user" && !displayText) return null

  // Skill çıktısı dosya token'ı: [[file:<mutlak yol>|<etiket>]] → tıkla & varsayılan uygulamada aç
  const FILE_TOKEN = /\[\[file:(.+?)\|(.+?)\]\]/g
  if (role !== "user" && FILE_TOKEN.test(displayText)) {
    FILE_TOKEN.lastIndex = 0
    const segments: Array<{ type: "text" | "file"; value: string; path?: string }> = []
    let last = 0
    for (const m of displayText.matchAll(FILE_TOKEN)) {
      if (m.index! > last) segments.push({ type: "text", value: displayText.slice(last, m.index) })
      segments.push({ type: "file", value: m[2], path: m[1] })
      last = m.index! + m[0].length
    }
    if (last < displayText.length) segments.push({ type: "text", value: displayText.slice(last) })

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
        <div className="rounded-xl border border-primary/15 dark:border-primary/20 bg-gradient-to-br from-primary/[0.04] via-muted/20 to-orange-500/[0.06] dark:from-primary/10 dark:via-muted/15 dark:to-orange-500/10 px-3 py-2 text-[12px] leading-relaxed text-foreground shadow-xs">
          {text}
        </div>
      </div>
    )
  }

  return <FormattedAssistantText text={displayText} message={message} />
}

/** Avatar-free message row — user bubble right, assistant text left (reasoning is in Worked for Xs). */
export function AiChatMessage({
  message,
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
