import type { YulaMessage } from "@/app/api/agent/chat/route"
import { useChatsStore, type YulaConversation } from "@/lib/stores/chats"
import { useActiveJobsStore } from "@/store/slices/active-jobs-store"
import { focusReportExecution } from "@/lib/report-run-bus"
import {
  extractJobIdFromHref,
  isGuidString,
  isWorkspaceHomePath,
  reportExecutionHref,
  reportExecutionPath,
  reportScopeFromPath,
} from "@/lib/workspace-paths"

function jobIdFromMessages(messages?: YulaMessage[]): string | undefined {
  if (!messages?.length) return undefined
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]
    if (message.role !== "assistant") continue
    for (const part of message.parts ?? []) {
      const row = part as {
        type?: string
        toolName?: string
        output?: { jobId?: unknown; navigateTo?: unknown }
      }
      const toolName =
        row.toolName ??
        (typeof row.type === "string" && row.type.startsWith("tool-")
          ? row.type.slice("tool-".length)
          : "")
      if (toolName !== "run_report" && toolName !== "run_job") continue
      const output = row.output
      if (!output || typeof output !== "object") continue
      if (typeof output.jobId === "string" && isGuidString(output.jobId)) {
        return output.jobId
      }
      if (typeof output.navigateTo === "string") {
        const fromNav = extractJobIdFromHref(output.navigateTo)
        if (fromNav) return fromNav
      }
    }
  }
  return undefined
}

export function resolveConversationJobId(
  conversation: YulaConversation,
  messages?: YulaMessage[],
): string | undefined {
  return (
    conversation.jobId ??
    extractJobIdFromHref(conversation.pathname) ??
    jobIdFromMessages(messages) ??
    undefined
  )
}

export function hrefForConversation(
  conversation: YulaConversation,
  messages?: YulaMessage[],
): string | undefined {
  const jobId = resolveConversationJobId(conversation, messages)
  const exec = reportExecutionPath(conversation.pathname)
  if (jobId && exec) return reportExecutionHref(exec, jobId)
  return conversation.pathname
}

export function restoreConversationExecution(
  conversation: YulaConversation,
  messages?: YulaMessage[],
): void {
  const jobId = resolveConversationJobId(conversation, messages)
  const scope = reportScopeFromPath(conversation.pathname)
  if (!jobId || !scope) return
  const tracked = useActiveJobsStore.getState().jobs[jobId]
  focusReportExecution({
    scope,
    job: {
      id: jobId,
      status: tracked?.status || "Completed",
      eventsUrl: tracked?.eventsUrl ?? "",
      jobUrl: tracked?.jobUrl ?? "",
      createdAt: tracked?.createdAt,
      name: tracked?.name ?? scope,
    },
    request: tracked?.payload,
  })
}

export function navigateToConversationScreen(
  conversation: YulaConversation,
  push: (href: string) => void,
  messages?: YulaMessage[],
): void {
  restoreConversationExecution(conversation, messages)
  const href = hrefForConversation(conversation, messages)
  if (!href) return
  const here =
    typeof window !== "undefined"
      ? `${window.location.pathname}${window.location.search}`.replace(/\/+$/, "") || "/"
      : "/"
  const dest = href.replace(/\/+$/, "") || "/"
  if (here !== dest) push(href)
}

const NAV_TOOL_NAMES = new Set(["navigate_to_page", "run_report", "run_job"])

/** Mesajlardaki SON navigasyon aracının hedef sayfası (yoksa null). */
function lastNavigateTargetFromMessages(messages?: YulaMessage[]): string | null {
  if (!messages?.length) return null
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]
    if (message.role !== "assistant") continue
    for (const part of message.parts ?? []) {
      const row = part as {
        type?: string
        toolName?: string
        state?: string
        output?: { navigateTo?: unknown }
      }
      const toolName =
        row.toolName ??
        (typeof row.type === "string" && row.type.startsWith("tool-")
          ? row.type.slice("tool-".length)
          : "")
      if (!NAV_TOOL_NAMES.has(toolName)) continue
      const output = row.output
      if (output && typeof output === "object" && typeof output.navigateTo === "string") {
        return output.navigateTo
      }
    }
  }
  return null
}

/**
 * Eski kayıt self-heal: "son açılan sayfa" kuralından önce oluşmuş, ana sayfaya
 * bağlı kalmış sohbetleri mesajlarındaki son navigasyon hedefine bağlar.
 * Uygulama açılışında bir kez çalışır.
 */
export function healConversationRecords(): void {
  const store = useChatsStore.getState()
  for (const conv of store.conversations) {
    const current = (conv.pathname ?? "/").split("?")[0] || "/"
    if (!isWorkspaceHomePath(current)) continue
    const target = lastNavigateTargetFromMessages(store.messagesById[conv.id])
    if (!target) continue
    useChatsStore.getState().followArrivedConversation(conv.id, target)
  }
}
