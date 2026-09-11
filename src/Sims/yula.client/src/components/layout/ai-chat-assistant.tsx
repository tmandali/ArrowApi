"use client";

import { usePathname, useRouter } from "next/navigation";
import * as React from "react"
import { useTranslations, useLocale } from "next-intl";
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Separator } from "@/components/ui/separator"
import { WorkspaceSidePanelTrigger } from "@/components/layout/workspace-side-panel"
import { YulaChatTurn } from "@/components/layout/yula-chat-turn"
import { YulaMarkIcon } from "@/components/layout/yula-brand"
import { workspaceIconFor } from "@/components/layout/workspace-brand"
import { YULA } from "@/components/layout/yula-brand-data"
import { YulaAgentCards } from "@/components/layout/yula-agent-cards"
import { useUserAgentsStore, ensureExampleAgent } from "@/lib/stores/user-agents"
import { AGENT_PROVIDER_OPTIONS, agentScopeWorkspaceId, filterAgentsByScope, localizeProviderOptions } from "@/lib/yula-user-agent"
import { readYulaClientAiConfig } from "@/lib/yula-ai-client-config"
import {
  getAllYulaCommands,
  localizeYulaCommands,
  matchYulaCommands,
  userSkillsToCommands,
  type YulaCommand,
} from "@/components/layout/yula-commands"
import { useChatsStore } from "@/lib/stores/chats"
import { useUserSkillsStore } from "@/lib/stores/user-skills"
import { buildUserSkillPrompt } from "@/lib/yula-user-skill"
import { YulaHistorySidebar, YulaHistoryMainView } from "@/components/layout/yula-history-sidebar"
import { useWorkspaceAiChat } from "@/context/workspace-ai-chat-context"
import { useYulaChat, useOptionalYulaChat } from "@/hooks/use-yula-chat"
import { yulaToolPartInfo } from "@/lib/yula-tool-info"
import type { YulaMessage } from "@/app/api/agent/chat/route"
import { formatPathnameLabel, isWorkspaceHomePath, workspaceIdFromPath, workspaceLabelFromPath, extractJobIdFromHref, extractJobIdFromPath, isReportResultPath, extractAgentIdFromPath, isAgentSessionPath } from "@/lib/workspace-paths"
import { peekQueuedYulaPrompt, subscribeQueuedYulaPrompt } from "@/lib/yula-pending-prompt"
import { cn } from "@/utils/cn"
import {
  ArrowDown,
  ArrowUp,
  CircleAlert,
  FileCode,
  FileText,
  Globe,
  History,
  Plus,
  RotateCw,
  Square,
  X,
} from "lucide-react"
import { getWorkspace } from "@/lib/workspace-registry"
import type { WorkspaceId } from "@/types"
import { AgentAvatar } from "@/features/system/components/agents/agent-avatar"
import { agentInitials } from "@/features/system/components/agents/agent-initials"

type AIChatAssistantProps = {
  className?: string
  /** Vertical rule to the left of the toolbar control. */
  separator?: boolean
}


type AttachedFile = {
  id: string
  name: string
  size: number
  type: string
  dataUrl?: string
}

/** Toolbar control — opens the workspace docked AI panel. */
export function AIChatAssistant({
  className,
  separator = true,
}: AIChatAssistantProps = {}) {
  const t = useTranslations("ChatAssistant")
  const router = useRouter()
  const { open, setOpen } = useWorkspaceAiChat()
  // Araç çubuğu uygulama kabuğunda yaşar; oturum henüz hazır değilken de
  // render edilir. newConversation yalnız tıklamada çağrılır — o ana kadar
  // oturum çoktan hazırdır, yine de null-güvenli tutulur.
  const { newConversation } = useOptionalYulaChat() ?? {}
  const pathname = usePathname()
  const isHomePage = isWorkspaceHomePath(pathname)
  const toolbarRef = React.useRef<HTMLDivElement>(null)
  const [isAlone, setIsAlone] = React.useState(false)

  // Only show the left separator when other actions sit beside Yula; a lone
  // Yula button needs no divider.
  React.useLayoutEffect(() => {
    const el = toolbarRef.current
    const parent = el?.parentElement
    if (!el || !parent) return

    const update = () => {
      const children = Array.from(parent.children)
      const index = children.indexOf(el)
      const hasLeadingAction = children
        .slice(0, index)
        .some((node) => (node as HTMLElement).offsetParent !== null)
      setIsAlone(!hasLeadingAction)
    }

    update()
    const mutationObserver = new MutationObserver(update)
    mutationObserver.observe(parent, { childList: true })
    const resizeObserver = new ResizeObserver(update)
    resizeObserver.observe(parent)
    return () => {
      mutationObserver.disconnect()
      resizeObserver.disconnect()
    }
  }, [])

  const showSeparator = separator !== false && !isAlone

  const handleOpenChange = (nextOpen: boolean) => {
    if (isHomePage) {
      newConversation?.()
      if (pathname !== "/") {
        router.push("/")
      }
    } else {
      setOpen(nextOpen)
    }
  }

  return (
    <div
      ref={toolbarRef}
      className={cn("flex items-center gap-1.5", className)}
    >
      {showSeparator ? (
        <Separator
          orientation="vertical"
          className="mx-0.5 data-vertical:h-4 data-vertical:self-auto"
        />
      ) : null}
      <WorkspaceSidePanelTrigger
        open={open}
        onOpenChange={handleOpenChange}
        iconOnly
        icon={YulaMarkIcon}
        aria-label={isHomePage ? t("new_chat_start") : t("yula_aria")}
        title={isHomePage ? t("new_chat_start") : YULA.name}
        className={cn(
          "group/ai size-7 border-none bg-transparent text-primary shadow-none hover:bg-transparent focus-visible:ring-0 active:scale-95 [&_svg]:!size-5",
          open && "bg-transparent hover:bg-transparent"
        )}
      >
        <YulaMarkIcon className="relative size-5 transition-transform duration-200 group-hover/ai:scale-110" />
      </WorkspaceSidePanelTrigger>
    </div>
  )
}


/**
 * Hata taşıyan araç parçası mı? İki biçim vardır:
 *  - SDK kanonik: state:"output-error" (+errorText)
 *  - Yürütücü yapılandırılmış: state:"output-available" + output.status="error"
 *    (araç hatayı patlatmadan dönerse modelin düzeltmesine bu şekilde izin verilir)
 */
function isFailedToolInfo(info: {
  state: string
  output?: unknown
  errorText?: string
}): boolean {
  if (info.state === "output-error") return true
  const out =
    typeof info.output === "object" && info.output !== null
      ? (info.output as Record<string, unknown>)
      : undefined
  return (
    out?.status === "error" ||
    out?.status === "validation-error" ||
    out?.status === "blocked" ||
    Boolean(out?.error)
  )
}

/**
 * Kısa göreli zaman ("az önce", "5 dk önce", "1 sa önce", "3 gün önce").
 * Geçmiş öneri satırının yanında rozet olarak gösterilir.
 */
function formatHistoryAgo(createdAt: number, t: (key: string, values?: Record<string, string | number | Date>) => string): string {
  const diffMs = Date.now() - createdAt
  const minutes = Math.max(0, Math.floor(diffMs / 60_000))
  if (minutes < 1) return t("history_just_now")
  if (minutes < 60) return t("history_minutes", { count: minutes })
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return t("history_hours", { count: hours })
  const days = Math.floor(hours / 24)
  if (days < 7) return t("history_days", { count: days })
  if (days < 30) return t("history_weeks", { count: Math.floor(days / 7) })
  const months = Math.floor(days / 30)
  if (months < 12) return t("history_months", { count: months })
  return t("history_years", { count: Math.floor(months / 12) })
}

import { useMounted } from "@/hooks/use-mounted"
import { formatDate, greetingFor } from "@/lib/welcome-format"
import { navigateToConversationScreen } from "@/lib/yula-history-navigation"

export function AIChatPanelTitle({ hideIcon = false }: { hideIcon?: boolean } = {}) {
  const t = useTranslations("ChatAssistant")
  const tScreen = useTranslations("ScreenLabels")
  const activeId = useChatsStore((s) => s.activeId)
  const conversations = useChatsStore((s) => s.conversations)
  const isHistoryOpen = useChatsStore((s) => s.isHistoryOpen)
  const isSearchingHistory = useChatsStore((s) => s.isSearchingHistory)
  const agents = useUserAgentsStore((s) => s.agents)
  const storeActiveAgentId = useUserAgentsStore((s) => s.activeAgentId)
  const pathname = usePathname()

  const activeConv = React.useMemo(
    () => conversations.find((c) => c.id === activeId),
    [conversations, activeId]
  )

  const screenLabel = formatPathnameLabel(pathname, (k) => tScreen(k)) || tScreen("fallback")

  // Dock başlığı: kayıtlı başlık yoksa (New / "Yeni Sohbet") aktif ajan
  // adı gösterilir; ajan yoksa varsayılan Yula. useDockAgent ile aynı
  // çözüm (konuşma kaydı > global seçim) — ikon ile isim uyumlu kalır.
  const dockAgentName = React.useMemo(() => {
    const id = activeConv?.agentId ?? storeActiveAgentId ?? null
    if (!id) return null
    return agents.find((a) => a.id === id)?.name ?? null
  }, [activeConv?.agentId, storeActiveAgentId, agents])

  let titleText: string = YULA.name
  if (isHistoryOpen || isSearchingHistory) {
    titleText = isWorkspaceHomePath(pathname) ? t("history_title") : t("screen_chats", { screen: screenLabel })
  } else if (activeConv?.title && activeConv.title !== "Yeni Sohbet") {
    titleText = activeConv.title
  } else if (dockAgentName) {
    titleText = dockAgentName
  }

  return (
    <div className="flex min-w-0 items-center gap-1.5 truncate">
      {hideIcon ? null : <YulaMarkIcon className="size-5 shrink-0" />}
      <span className="truncate text-xs font-semibold">{titleText}</span>
    </div>
  )
}

type AIChatPanelProps = {
  /** Centered Copilot-style intro until the user starts typing. */
  centeredIntro?: boolean
  /** View mode: "main" (Ana Ekran full-width) or "dock" (Right side panel). Auto-detected if omitted. */
  mode?: "main" | "dock"
  /** Intro ekranında text box'ın altında gösterilen ek içerik (pinler / çalışma alanı kutuları). */
  belowInput?: React.ReactNode
  /** Text box'ın üstünde gösterilen ek içerik (ajan oturum bilgi satırı). */
  aboveInput?: React.ReactNode
}

/**
 * Sohbet oturumu (YulaChatContext) henüz hazır değilse panel yerinde bekler:
 * kısa beklemede "hazırlanıyor", ~4 sn'yi aşarsa "yüklenemedi" + yenileme.
 * Uygulama kabuğu bu durumdan BAĞIMSIZ açılır — bekleme yalnız panel içidir.
 */
function ChatSessionFallback() {
  const t = useTranslations("ChatAssistant")
  const [isStuck, setIsStuck] = React.useState(false)
  React.useEffect(() => {
    const timer = setTimeout(() => setIsStuck(true), 4000)
    return () => clearTimeout(timer)
  }, [])
  if (isStuck) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-sm">
        <div className="flex items-center gap-2 font-medium text-destructive">
          <CircleAlert className="size-4" aria-hidden />
          <span>{t("app_load_failed")}</span>
        </div>
        <p className="max-w-md text-center text-xs opacity-70">
          {t("session_error_desc")}
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="inline-flex h-8 items-center justify-center gap-2 rounded-md border px-3 text-xs font-medium hover:bg-accent"
        >
          <RotateCw className="size-3.5" aria-hidden />
          {t("reload_btn")}
        </button>
      </div>
    )
  }
  return (
    <div className="flex h-full items-center justify-center p-6 text-sm opacity-60">
      {t("session_preparing")}
    </div>
  )
}

/** Docked or main screen panel body — avatar-free chat box with attach + slash commands. */
export function AIChatPanel(props: AIChatPanelProps = {}) {
  const session = useOptionalYulaChat()
  if (!session) {
    return <ChatSessionFallback />
  }
  return <AIChatPanelSession {...props} />
}

function AIChatPanelSession({
  centeredIntro = false,
  mode,
  belowInput,
  aboveInput,
}: AIChatPanelProps = {}) {
  const t = useTranslations("ChatAssistant")
  const tCat = useTranslations("AgentCatalog")
  const isSearchingHistory = useChatsStore((s) => s.isSearchingHistory)
  const isHistoryOpen = useChatsStore((s) => s.isHistoryOpen)
  const yula = useYulaChat()
  const status = yula.status
  const isProcessing = yula.busy
  const { messages } = yula



  const [queuedPrompt, setQueuedPrompt] = React.useState(peekQueuedYulaPrompt)
  React.useEffect(() => subscribeQueuedYulaPrompt(() => setQueuedPrompt(peekQueuedYulaPrompt())), [])

  // SDK geçişlerinde (stream + persist rehydrate) aynı id'li mesaj dizide
  // iki kez bulunabilir → React key çakışması ve çift balon render'ı.
  // Render öncesi id'ye göre tekilleştir (SON kopya en taze durumudur).
  const dedupedMessages = React.useMemo(() => {
    const lastById = new Map<string, number>()
    messages.forEach((m, i) => lastById.set(m.id, i))
    if (lastById.size === messages.length) return messages
    return messages.filter((m, i) => lastById.get(m.id) === i)
  }, [messages])

  // Sohbet mesajlarını Soru-Cevap turlarına (YulaChatTurn) grupla (Çok adımlı araç çağrılarını birleştirir)
  const turns = React.useMemo(() => {
    const list: Array<{
      id: string
      userMessage?: YulaMessage
      assistantMessage?: YulaMessage
      assistantMessages: YulaMessage[]
    }> = []

    let currentTurn: {
      id: string
      userMessage?: YulaMessage
      assistantMessages: YulaMessage[]
    } | null = null

    for (const m of dedupedMessages) {
      if (m.role === "user") {
        if (currentTurn) {
          const combinedParts = currentTurn.assistantMessages.flatMap((a) => a.parts)
          const lastAssistant = currentTurn.assistantMessages[currentTurn.assistantMessages.length - 1]
          list.push({
            id: currentTurn.id,
            userMessage: currentTurn.userMessage,
            assistantMessage: lastAssistant ? { ...lastAssistant, parts: combinedParts } : undefined,
            assistantMessages: currentTurn.assistantMessages,
          })
        }
        currentTurn = { id: m.id, userMessage: m, assistantMessages: [] }
      } else if (m.role === "assistant") {
        if (currentTurn) {
          currentTurn.assistantMessages.push(m)
        } else {
          list.push({ id: m.id, assistantMessage: m, assistantMessages: [m] })
        }
      }
    }
    if (currentTurn) {
      const combinedParts = currentTurn.assistantMessages.flatMap((a) => a.parts)
      const lastAssistant = currentTurn.assistantMessages[currentTurn.assistantMessages.length - 1]
      list.push({
        id: currentTurn.id,
        userMessage: currentTurn.userMessage,
        assistantMessage: lastAssistant ? { ...lastAssistant, parts: combinedParts } : undefined,
        assistantMessages: currentTurn.assistantMessages,
      })
    }
    return list
  }, [dedupedMessages])

  // Canlı akış görünümü: en son asistan mesajının parçalarından türetilir
  const lastAssistant = messages.length > 0 ? [...messages].reverse().find((m) => m.role === "assistant") : undefined
  const streaming = status === "submitted" || status === "streaming"
  const streamingThinking = streaming && lastAssistant
    ? lastAssistant.parts.filter((p) => p.type === "reasoning").map((p: any) => p.text ?? "").join("")
    : ""
  const streamingContent = streaming && lastAssistant
    ? lastAssistant.parts.filter((p) => p.type === "text").map((p) => p.text).join("")
    : ""

  const [input, setInput] = React.useState("")
  const [attachments, setAttachments] = React.useState<AttachedFile[]>([])
  const [selectedCommand, setSelectedCommand] = React.useState<YulaCommand | null>(null)
  const [pastedChip, setPastedChip] = React.useState<{
    id: string
    content: string
    preview: string
  } | null>(null)
  const [selectedIndex, setSelectedIndex] = React.useState(0)
  const [prevCommandInput, setPrevCommandInput] = React.useState("")
  const [historyIndex, setHistoryIndex] = React.useState(0)
  const [historyClosed, setHistoryClosed] = React.useState(false)
  // Girdi değişince komut seçimini başa al — render sırasında state ayarlama.
  if (prevCommandInput !== input) {
    setPrevCommandInput(input)
    setSelectedIndex(0)
    setHistoryIndex(0)
    setHistoryClosed(false)
  }
  const [isAtBottom, setIsAtBottom] = React.useState(true)

  const scrollRef = React.useRef<HTMLDivElement>(null)
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const textareaRef = React.useRef<HTMLTextAreaElement>(null)

  const handleUndo = React.useCallback((text: string) => {
    setInput(text)
    requestAnimationFrame(() => {
      textareaRef.current?.focus()
    })
  }, [])

  const pathname = usePathname()
  const router = useRouter()
  const isHomePath = isWorkspaceHomePath(pathname) || isAgentSessionPath(pathname)
  const isMainMode = mode ? mode === "main" : isHomePath

  const mounted = useMounted()
  const now = React.useMemo(() => new Date(), [])
  const tGreet = useTranslations("Greeting")
  const locale = useLocale()
  const greeting = mounted ? greetingFor(now, tGreet) : t("greeting")
  const dateLabel = mounted ? formatDate(now, locale) : null

  const workspaceLabel = workspaceLabelFromPath(pathname)
  // Karşılama ekranı workspace kökünde (ör. /stock) workspace'in kendi ikonunu
  // ve etiketini gösterir; Yula kökü (/) marka ikonuyla kalır — farkındalık için.
  const isYulaRoot = pathname === "/"
  const workspaceRootIcon = React.useMemo(() => {
    if (isYulaRoot) return null
    const icon = workspaceIconFor(workspaceIdFromPath(pathname))
    return icon
      ? React.createElement(icon, { className: "size-16 text-yula-accent" })
      : null
  }, [isYulaRoot, pathname])
  const introDescription = t("yula_intro", { workspace: workspaceLabel, desc: t("yula_empty_desc") })

  const isLoading = isProcessing
  const selectedJobId =
    typeof window !== "undefined"
      ? extractJobIdFromHref(`${pathname}${window.location.search}`)
      : extractJobIdFromPath(pathname)
  const isViewingResults =
    isReportResultPath(pathname) || Boolean(selectedJobId)
  const userSkills = useUserSkillsStore((s) => s.skills)
  const workspaceId = workspaceIdFromPath(pathname)
  // Ajan kapsamı: "/" ana sayfada global ajanlar geçerli, system
  // yönetim sayfalarında ajan seçilemez (skill kapsamı etkilenmez).
  const agentWorkspaceId = agentScopeWorkspaceId(pathname)
  // Oturum ajanı (hero karşılaması için; girdi üstü rozet kaldırıldı —
  // kimlik URL + panel başlığı + hero ile belli olur).
  const userAgents = useUserAgentsStore((s) => s.agents)
  const activeAgentId = useUserAgentsStore((s) => s.activeAgentId)
  const routeAgentId = extractAgentIdFromPath(pathname)
  const isAgentSession = isAgentSessionPath(pathname)
  const effectiveAgent = React.useMemo(() => {
    // Ayrı ajan oturumunda URL kazanır (kapsam filtresiz direkt bul).
    if (routeAgentId) return userAgents.find((a) => a.id === routeAgentId) ?? null
    const inScope = filterAgentsByScope(userAgents, agentWorkspaceId)
    return activeAgentId ? (inScope.find((a) => a.id === activeAgentId) ?? null) : null
  }, [userAgents, activeAgentId, agentWorkspaceId, routeAgentId])
  const chatsModel = useChatsStore((s) => s.model)
  const isThinkingEnabled = useChatsStore((s) => s.isThinkingEnabled)
  // Ajanın kullandığı çıkarım kimliği (ajan pini > genel ayar zinciri).
  const agentInference = React.useMemo(() => {
    if (!effectiveAgent) return null
    const aiConfig = readYulaClientAiConfig()
    const providerId = effectiveAgent.provider || aiConfig.provider || ""
    const providerLabel =
      localizeProviderOptions(AGENT_PROVIDER_OPTIONS, tCat).find(
        (p) => p.id === providerId,
      )?.label ??
      (providerId || t("inference_server_default"))
    const providerText = `${providerLabel}${effectiveAgent.provider ? "" : ` ${t("inference_general")}`}`
    const model = effectiveAgent.model || chatsModel || aiConfig.model || ""
    const modelText = `${model || t("inference_model_default")}${effectiveAgent.model ? "" : ` ${t("inference_general")}`}`
    const effort = effectiveAgent.effort || aiConfig.effort || null
    const effortText = effort
      ? `${t("inference_effort")}: ${effort}${effectiveAgent.effort ? "" : ` ${t("inference_general")}`}`
      : `${t("inference_effort")}: ${t("inference_general")}`
    const thinkingOn = effectiveAgent.thinking ?? isThinkingEnabled
    const thinkingText = `${t("inference_thinking")}: ${thinkingOn ? t("inference_on") : t("inference_off")}${effectiveAgent.thinking === undefined ? ` ${t("inference_general")}` : ""}`
    return `${providerText} · ${modelText} · ${effortText} · ${thinkingText}`
  }, [effectiveAgent, chatsModel, isThinkingEnabled, t, tCat])
  const tc = useTranslations("Commands")
  // Komut menüsündeki skill'ler ajanın seçtikleridir (açık seçim kapsamı
  // ezer; seçili ajan + boş liste = skill komutu yok).
  const userSkillCommands = React.useMemo(
    () =>
      userSkillsToCommands(
        userSkills,
        workspaceId,
        effectiveAgent ? effectiveAgent.skills : undefined,
        tc,
      ),
    [userSkills, workspaceId, effectiveAgent, tc],
  )
  // Örnek ajan: ana sayfa kartlarında seçilebilir olması için ilk bağlanışta üret.
  // `locale` bağımlılığı: dil değişirse (aynı oturumda bile) yeni locale seed'i garanti.
  React.useEffect(() => {
    ensureExampleAgent(locale as "tr" | "en")
  }, [locale])
  const allCommands = React.useMemo(
    () => localizeYulaCommands(getAllYulaCommands(isViewingResults, pathname, userSkillCommands), tc),
    // `tc` render başına yenidir; liste küçüktür → her render yeniden çözümle
    [isViewingResults, pathname, userSkillCommands, tc]
  )
  const commandMatches = matchYulaCommands(input, allCommands)
  const showCommands = input.startsWith("/") && commandMatches !== null && commandMatches.length > 0
  // "Ajan oluştur" alt öğesi yalnız ana Yula ekranında (/) gösterilir ve
  // ok tuşu gezintisine dahildir (son sıra).
  const showNewAgentItem = showCommands && pathname === "/"
  const paletteItemCount = (commandMatches?.length ?? 0) + (showNewAgentItem ? 1 : 0)
  const isNewAgentSelected =
    showNewAgentItem && selectedIndex === (commandMatches?.length ?? 0)
  // Ajan geçmişi önerileri: yazdıkça bu ajanın kendi kayıtlarındaki
  // kullanıcı sorularından ilk 10 eşleşme (ok tuşlarıyla gezilir).
  // YulaHistoryMainView ile aynı ajan ayrımı: (c.agentId ?? null) eşleşmesi.
  const historyConversations = useChatsStore((s) => s.conversations)
  const historyMessagesById = useChatsStore((s) => s.messagesById)
  const historyAgentId = effectiveAgent?.id ?? null
  const historySuggestions = React.useMemo(() => {
    const q = input.trim().toLowerCase()
    if (!q || q.length < 2 || input.startsWith("/")) return []
    const seen = new Set<string>()
    const out: Array<{ text: string; title: string; createdAt: number; convId: string }> = []
    const sorted = [...historyConversations]
      .filter((c) => (c.agentId ?? null) === (historyAgentId ?? null))
      .sort((a, b) => b.createdAt - a.createdAt)
    for (const conv of sorted) {
      const msgs = historyMessagesById[conv.id] ?? []
      if (msgs.length > 0) {
        for (let i = msgs.length - 1; i >= 0 && out.length < 10; i -= 1) {
          const m = msgs[i]
          if (m.role !== "user") continue
          const text = m.parts
            .filter((p) => p.type === "text")
            .map((p) => (p as { text?: string }).text ?? "")
            .join("\n")
            .trim()
          if (!text || text.length < 2) continue
          const key = text.toLowerCase()
          if (key === q || seen.has(key)) continue
          if (!key.includes(q)) continue
          seen.add(key)
          out.push({ text, title: conv.title || text.slice(0, 40), createdAt: conv.createdAt, convId: conv.id })
          if (out.length >= 10) break
        }
      } else {
        // Henüz mesajı yüklenmemiş kayıt: başlık üzerinden eşleşme.
        const title = (conv.title || "").trim()
        if (!title || title === "Yeni Sohbet") continue
        const key = title.toLowerCase()
        if (key === q || seen.has(key)) continue
        if (!key.includes(q)) continue
        seen.add(key)
        out.push({ text: title, title, createdAt: conv.createdAt, convId: conv.id })
      }
      if (out.length >= 10) break
    }
    return out
  }, [input, historyConversations, historyMessagesById, historyAgentId])
  const showHistory =
    !showCommands &&
    !historyClosed &&
    historySuggestions.length > 0 &&
    !selectedCommand &&
    !pastedChip
  // Geçmiş öneri seçimi: girdiyi doldurmak yerine kayıtlı sohbeti açar
  // (geçmiş panelindeki seçimle aynı akış: seç + ekrana git).
  const openHistoryConversation = React.useCallback(
    (convId: string) => {
      const store = useChatsStore.getState()
      const session = store.conversations.find((c) => c.id === convId)
      if (!session) return
      setInput("")
      setHistoryClosed(true)
      setHistoryIndex(0)
      store.selectConversation(convId)
      navigateToConversationScreen(
        session,
        (href) => {
          router.push(href)
        },
        store.messagesById[convId],
      )
      store.setHistoryOpen(false)
      store.setSearchingHistory(false)
    },
    [router],
  )
  const hasUserMessages = messages.some((message) => message.role === "user")
  const showCenteredIntro = (centeredIntro || (isMainMode && isHomePath)) && !hasUserMessages

  // Sohbet değişiminde (New / konuşma seçimi) scroll durumunu sıfırla:
  // boşalan ekranda scroll olayı tetiklenmez, eski "alta kaydır" rozeti asılı kalır.
  // React'in "props değişince render sırasında state ayarla" deseni (effect'siz).
  const activeConversationId = yula.activeId
  const [renderedConversationId, setRenderedConversationId] =
    React.useState(activeConversationId)
  if (renderedConversationId !== activeConversationId) {
    setRenderedConversationId(activeConversationId)
    setIsAtBottom(true)
  }

  const scrollToBottom = React.useCallback((behavior: ScrollBehavior = "smooth") => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior })
  }, [])

  React.useEffect(() => {
    if (isAtBottom) scrollToBottom(isLoading ? "auto" : "smooth")
  }, [messages, isLoading, streamingThinking, streamingContent, isAtBottom, scrollToBottom])

  // Focus textbox ONLY when activeConversationId actually changes and history is closed.
  const prevConvIdRef = React.useRef<string | null>(null)
  React.useEffect(() => {
    if (isHistoryOpen || isSearchingHistory) return
    if (prevConvIdRef.current !== activeConversationId) {
      prevConvIdRef.current = activeConversationId
      requestAnimationFrame(() => {
        textareaRef.current?.focus()
      })
    }
  }, [activeConversationId, isHistoryOpen, isSearchingHistory])

  const onScroll = () => {
    const el = scrollRef.current
    if (!el) return
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight
    setIsAtBottom(distance < 48)
  }

  const newConversation = yula.newConversation

  const sendText = (text: string) => {
    const trimmed = text.trim()
    const promptPrefix = selectedCommand ? selectedCommand.prompt : ""
    const pastedBlock = pastedChip ? `\n\n\`\`\`\n${pastedChip.content}\n\`\`\`` : ""

    if (!trimmed && !promptPrefix && !pastedChip && attachments.length === 0) return

    if (
      selectedCommand?.id === "attach" ||
      selectedCommand?.slash === "dosya" ||
      trimmed.toLowerCase() === "/dosya"
    ) {
      fileInputRef.current?.click()
      setInput("")
      setSelectedCommand(null)
      setPastedChip(null)
      setHistoryClosed(true)
      return
    }

    if (selectedCommand?.id === "new" || trimmed.toLowerCase() === "/new") {
      newConversation()
      setInput("")
      setSelectedCommand(null)
      setPastedChip(null)
      setAttachments([])
      setHistoryClosed(true)
      return
    }

    let finalPrompt = ""
    if (selectedCommand?.source === "user") {
      finalPrompt = buildUserSkillPrompt(selectedCommand, trimmed)
    } else if (promptPrefix) {
      finalPrompt = trimmed ? `${promptPrefix} ${trimmed}` : promptPrefix
    } else {
      finalPrompt = trimmed
    }

    if (pastedBlock) {
      finalPrompt = `${finalPrompt}${pastedBlock}`.trim()
    }

    const currentAttachments = [...attachments]
    yula.sendMessageText(`${finalPrompt}`.trim(), currentAttachments)
    setInput("")
    setSelectedCommand(null)
    setPastedChip(null)
    setAttachments([])
    setHistoryClosed(true)
  }

  const handleSend = () => {
    sendText(input)
  }

  const applyCommand = (command: YulaCommand) => {
    if (command.id === "new") {
      newConversation()
      setInput("")
      setSelectedCommand(null)
      setPastedChip(null)
      setHistoryClosed(true)
      return
    }
    if (command.id === "attach" || command.slash === "dosya") {
      fileInputRef.current?.click()
      setInput("")
      setSelectedCommand(null)
      setPastedChip(null)
      setHistoryClosed(true)
      return
    }
    setSelectedCommand(command)
    setInput("")
    requestAnimationFrame(() => textareaRef.current?.focus())
  }

  const onFilesSelected = (files: FileList | null) => {
    if (!files?.length) return
    const fileArray = Array.from(files)

    fileArray.forEach((file) => {
      const id = `${file.name}-${file.size}-${file.lastModified}`
      const isImage = file.type.startsWith("image/")

      if (isImage) {
        const reader = new FileReader()
        reader.onload = (e) => {
          const dataUrl = e.target?.result as string
          setAttachments((current) => {
            if (current.some((f) => f.id === id)) return current
            return [...current, { id, name: file.name, size: file.size, type: file.type, dataUrl }].slice(0, 5)
          })
        }
        reader.readAsDataURL(file)
      } else {
        setAttachments((current) => {
          if (current.some((f) => f.id === id)) return current
          return [...current, { id, name: file.name, size: file.size, type: file.type }].slice(0, 5)
        })
      }
    })
  }

  const canSubmit =
    Boolean(input.trim()) ||
    Boolean(selectedCommand) ||
    Boolean(pastedChip) ||
    attachments.length > 0

  const inputArea = (
    <div className="relative mx-auto w-full max-w-3xl shrink-0 space-y-1.5 px-3 pb-2 pt-1.5">
      {showCommands ? (
        <div className="absolute inset-x-3 bottom-full z-20 mb-1.5 overflow-hidden rounded-xl border border-border/80 bg-popover/95 backdrop-blur-md shadow-lg">
          <Command shouldFilter={false} className="p-1">
            <CommandList className="max-h-48 overflow-y-auto no-scrollbar">
              <CommandEmpty className="py-2 text-[11px] text-muted-foreground text-center">
                {t("command_empty")}
              </CommandEmpty>
              <CommandGroup className="p-0">
                {(commandMatches ?? []).map((command, idx) => {
                  const Icon = command.icon
                  const isSelected = idx === selectedIndex
                  return (
                    <CommandItem
                      key={command.id}
                      value={command.slash}
                      onSelect={() => applyCommand(command)}
                      data-selected={isSelected ? "true" : undefined}
                      className={cn(
                        "flex items-center gap-2 rounded-lg px-2 py-1 text-[11.5px] cursor-pointer min-h-0 transition-colors",
                        isSelected
                          ? "bg-accent text-accent-foreground font-medium"
                          : "hover:bg-accent/80"
                      )}
                    >
                      <Icon className="size-3.5 text-primary shrink-0" />
                      <span className="font-semibold text-foreground shrink-0">
                        /{command.slash}
                      </span>
                      <span className="text-[10.5px] text-muted-foreground truncate flex-1 min-w-0">
                        {command.description || command.label}
                      </span>
                      {command.source === "user" ? (
                        <span className="shrink-0 rounded border border-primary/30 bg-primary/10 px-1 py-px text-[9.5px] font-medium text-primary">
                          skill
                        </span>
                      ) : null}
                    </CommandItem>
                  )
                })}
                {showNewAgentItem ? (
                  <CommandItem
                    value="__new-agent__"
                    onSelect={() => router.push("/system/agents")}
                    data-selected={isNewAgentSelected ? "true" : undefined}
                    className={cn(
                      "flex items-center gap-2 rounded-lg px-2 py-1 text-[11.5px] cursor-pointer min-h-0 transition-colors",
                      isNewAgentSelected
                        ? "bg-accent text-accent-foreground font-medium"
                        : "hover:bg-accent/80"
                    )}
                  >
                    <Plus className="size-3.5 text-primary shrink-0" />
                    <span className="font-semibold text-foreground shrink-0">
                      {t("agent_create")}
                    </span>
                    <span className="text-[10.5px] text-muted-foreground truncate flex-1 min-w-0">
                      {t("agent_manage_open")}
                    </span>
                  </CommandItem>
                ) : null}
              </CommandGroup>
            </CommandList>
          </Command>
        </div>
      ) : showHistory ? (
        <div className="absolute inset-x-3 bottom-full z-20 mb-1.5 overflow-hidden rounded-xl border border-border/80 bg-popover/95 backdrop-blur-md shadow-lg">
          <div className="px-2.5 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
            {t("history_suggestions")}
          </div>
          <Command shouldFilter={false} className="p-1 pt-0.5">
            <CommandList className="max-h-48 overflow-y-auto no-scrollbar">
              <CommandGroup className="p-0">
                {historySuggestions.map((s, idx) => {
                  const isSelected = idx === historyIndex
                  return (
                    <CommandItem
                      key={`${s.convId}-${s.text.slice(0, 48)}-${idx}`}
                      value={s.text}
                      onSelect={() => openHistoryConversation(s.convId)}
                      onMouseMove={() => {
                        if (!isSelected) setHistoryIndex(idx)
                      }}
                      data-selected={isSelected ? "true" : undefined}
                      className={cn(
                        "flex items-center gap-2 rounded-lg px-2 py-1 text-[11.5px] cursor-pointer min-h-0 transition-colors",
                        isSelected
                          ? "bg-accent text-accent-foreground font-medium"
                          : "hover:bg-accent/80"
                      )}
                    >
                      <History className="size-3.5 text-primary shrink-0" />
                      <span className="truncate flex-1 min-w-0 text-foreground">
                        {s.text.length > 120 ? `${s.text.slice(0, 120)}…` : s.text}
                      </span>
                      <span className="shrink-0 text-[10px] font-medium text-muted-foreground/70">
                        {formatHistoryAgo(s.createdAt, t)}
                      </span>
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </div>
      ) : null}

      {isLoading ? (
        <p className="px-1 text-[11px] text-muted-foreground">
          {t("still_answering")}
        </p>
      ) : null}
      <form
        onSubmit={(event) => {
          event.preventDefault()
          if (showCommands) return
          handleSend()
        }}
        className="rounded-xl border border-primary/15 bg-gradient-to-br from-primary/[0.04] via-muted/20 to-orange-500/[0.06] p-1.5 shadow-sm focus-within:border-primary/35 focus-within:ring-2 focus-within:ring-primary/15 dark:border-primary/20 dark:from-primary/10 dark:via-muted/15 dark:to-orange-500/10"
      >
        <div className="flex flex-wrap items-center gap-1.5 px-1 py-0.5 min-h-[36px]">
          {selectedCommand ? (
            <span className="inline-flex shrink-0 items-center gap-1.5 text-[12px] font-semibold text-primary select-none animate-in fade-in zoom-in-95 duration-150">
              {React.createElement(selectedCommand.icon, { className: "size-3.5 shrink-0 text-primary" })}
              <span className="truncate">{selectedCommand.label}</span>
            </span>
          ) : null}

          {pastedChip ? (
            <span className="inline-flex shrink-0 items-center gap-1.5 text-[12px] font-semibold text-orange-600 dark:text-orange-400 select-none animate-in fade-in zoom-in-95 duration-150">
              <FileCode className="size-3.5 shrink-0 text-orange-500" />
              <span className="max-w-[220px] truncate">{pastedChip.preview}</span>
            </span>
          ) : null}

          {attachments.map((file) => (
            <span
              key={file.id}
              className="inline-flex shrink-0 max-w-full items-center gap-1 rounded-full border bg-muted/40 px-2 py-0.5 text-[10px] text-muted-foreground"
            >
              <FileText className="size-3 shrink-0" />
              <span className="truncate">{file.name}</span>
              <button
                type="button"
                className="rounded-full p-0.5 hover:bg-muted hover:text-foreground"
                onClick={() =>
                  setAttachments((current) =>
                    current.filter((item) => item.id !== file.id)
                  )
                }
                aria-label={t("remove_attachment", { name: file.name })}
              >
                <X className="size-3" />
              </button>
            </span>
          ))}

          <textarea
            ref={textareaRef}
            value={input}
            rows={1}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (showCommands && paletteItemCount > 0) {
                if (event.key === "ArrowDown") {
                  event.preventDefault()
                  setSelectedIndex((prev) => (prev + 1) % paletteItemCount)
                  return
                }
                if (event.key === "ArrowUp") {
                  event.preventDefault()
                  setSelectedIndex((prev) => (prev - 1 + paletteItemCount) % paletteItemCount)
                  return
                }
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault()
                  if (isNewAgentSelected) {
                    router.push("/system/agents")
                    return
                  }
                  const targetCmd = commandMatches?.[selectedIndex] ?? commandMatches?.[0]
                  if (targetCmd) {
                    applyCommand(targetCmd)
                  }
                  return
                }
                if (event.key === "Escape") {
                  event.preventDefault()
                  setInput("")
                  return
                }
              }

              if (showHistory) {
                if (event.key === "ArrowDown") {
                  event.preventDefault()
                  setHistoryIndex((prev) => (prev + 1) % historySuggestions.length)
                  return
                }
                if (event.key === "ArrowUp") {
                  event.preventDefault()
                  setHistoryIndex(
                    (prev) =>
                      (prev - 1 + historySuggestions.length) % historySuggestions.length,
                  )
                  return
                }
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault()
                  const target = historySuggestions[historyIndex] ?? historySuggestions[0]
                  if (target) {
                    openHistoryConversation(target.convId)
                  }
                  return
                }
                if (event.key === "Escape") {
                  event.preventDefault()
                  setHistoryClosed(true)
                  return
                }
              }

              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault()
                handleSend()
              }
              if (event.key === "Backspace" && !input) {
                if (pastedChip) {
                  setPastedChip(null)
                } else if (selectedCommand) {
                  setSelectedCommand(null)
                }
              }
            }}
            onPaste={(event) => {
              const items = event.clipboardData?.items
              if (items) {
                const imageFiles: File[] = []
                for (let i = 0; i < items.length; i++) {
                  if (items[i].type.startsWith("image/")) {
                    const file = items[i].getAsFile()
                    if (file) imageFiles.push(file)
                  }
                }
                if (imageFiles.length > 0) {
                  const dt = new DataTransfer()
                  imageFiles.forEach((f) => dt.items.add(f))
                  onFilesSelected(dt.files)
                }
              }

              const pastedText = event.clipboardData.getData("text")
              if (!pastedText) return

              const lines = pastedText.split(/\r?\n/)
              const isMultiLine = lines.length > 5 && pastedText.trim().length > 300
              const isLong = pastedText.trim().length > 500

              if (isMultiLine || isLong) {
                event.preventDefault()
                const preview = lines.length > 5
                  ? t("paste_lines", { count: lines.length })
                  : t("paste_chars", { count: pastedText.trim().length })

                setPastedChip({
                  id: `paste-${Date.now()}`,
                  content: pastedText,
                  preview,
                })
              }
            }}
            placeholder={
              selectedCommand || pastedChip
                ? t("input_placeholder_secondary")
                : t("yula_placeholder")
            }
            className="flex-1 min-w-[120px] min-h-[28px] max-h-32 resize-none border-0 bg-transparent px-1 py-1 text-[12px] leading-relaxed outline-none placeholder:text-muted-foreground"
          />
        </div>

        <div className="flex items-center justify-between gap-2 px-0.5 pt-0.5">
          <div className="flex items-center gap-0.5">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(event) => {
                onFilesSelected(event.target.files)
                event.target.value = ""
              }}
            />
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className={cn(
                "size-7 rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                input.startsWith("/") && "bg-primary/10 text-primary font-medium"
              )}
              onClick={() => {
                setInput((prev) => (prev.startsWith("/") ? "" : "/"))
                requestAnimationFrame(() => textareaRef.current?.focus())
              }}
              aria-label={t("show_commands")}
              title={t("show_commands")}
            >
              <Plus className="size-3.5" />
            </Button>
          </div>

          {isLoading && !canSubmit ? (
            <Button
              type="button"
              size="icon"
              onClick={() => void yula.stop()}
              className="size-7 rounded-full border border-red-500/40 bg-red-500/10 text-red-600 hover:bg-red-500/20 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 transition-all"
              aria-label={t("stop")}
              title={t("stop")}
            >
              <Square className="size-3 fill-current" />
            </Button>
          ) : (
            <Button
              type="submit"
              size="icon"
              disabled={!canSubmit}
              className="size-7 rounded-full bg-gradient-to-br from-primary to-orange-500 text-primary-foreground hover:from-primary/90 hover:to-orange-500/90 transition-all"
              aria-label={t("send_aria")}
            >
              <ArrowUp className="size-3.5" />
            </Button>
          )}
        </div>
      </form>
    </div>
  )

  /**
   * Kurtarılmış araç hataları: hatadan sonra sohbette ilerleme varsa (başarılı
   * araç çıktısı, metin ya da yeni kullanıcı mesajı) model sorunu zaten
   * çözmüştür → bu hatalar kullanıcıya KIRMIZI olarak gösterilmez (kafa
   * karışıklığını önler). Yalnız tur sonundaki gerçek başarısızlıklar kırmızıdır.
   */
  const recoveredToolCallIds = React.useMemo(() => {
    const ids = new Set<string>()
    type Progress = { msgIdx: number; partIdx: number }
    const progresses: Progress[] = []
    messages.forEach((m, mi) => {
      m.parts.forEach((p, pi) => {
        if (m.role === "user") {
          progresses.push({ msgIdx: mi, partIdx: pi })
          return
        }
        const info = yulaToolPartInfo(p)
        if (info) {
          if (info.state === "output-available" && !isFailedToolInfo(info)) {
            progresses.push({ msgIdx: mi, partIdx: pi })
          }
        } else if (
          p.type === "text" &&
          ((p as { text?: string }).text ?? "").trim()
        ) {
          progresses.push({ msgIdx: mi, partIdx: pi })
        }
      })
    })
    messages.forEach((m, mi) => {
      m.parts.forEach((p, pi) => {
        const info = yulaToolPartInfo(p)
        if (!info || !isFailedToolInfo(info)) return
        const hasLaterProgress = progresses.some(
          (pr) => pr.msgIdx > mi || (pr.msgIdx === mi && pr.partIdx > pi),
        )
        if (hasLaterProgress) ids.add(info.toolCallId)
      })
    })
    return ids
  }, [messages])

  const chatPanelBody = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="relative min-h-0 flex-1">
        {showCenteredIntro ? (
          isHomePath ? (
            <div className="mx-auto flex h-full w-full max-w-3xl flex-col items-center gap-6 px-4 pt-16 pb-8 md:pt-20 overflow-y-auto no-scrollbar">
              <div className="flex flex-col items-center gap-4 text-center">
                {effectiveAgent?.avatar ? (
                  <AgentAvatar
                    value={effectiveAgent.avatar}
                    name={effectiveAgent.name}
                    className="size-16 rounded-2xl"
                  />
                ) : effectiveAgent ? (
                  <span className="flex size-16 items-center justify-center rounded-2xl bg-orange-500 text-2xl font-bold text-white">
                    {agentInitials(effectiveAgent.name)}
                  </span>
                ) : (
                  workspaceRootIcon ?? <YulaMarkIcon className="size-16" />
                )}
                <div className="space-y-1.5">
                  <h1
                    className={cn(
                      "text-3xl font-bold tracking-tight",
                      (workspaceRootIcon || effectiveAgent) && "text-primary"
                    )}
                  >
                    {effectiveAgent
                      ? effectiveAgent.name
                      : workspaceRootIcon
                        ? workspaceLabel
                        : greeting}
                  </h1>
                  <p className="text-sm text-muted-foreground">
                    {effectiveAgent
                      ? effectiveAgent.description || t("speaking_with_agent")
                      : workspaceRootIcon
                        ? t("yula_empty_desc")
                        : t("yula_description")}
                  </p>
                  {effectiveAgent ? (
                    <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground/75">
                      <Globe className="size-3.5 shrink-0" />
                      {effectiveAgent.scope && effectiveAgent.scope !== "global"
                        ? t("works_in_workspace", { workspace: getWorkspace(effectiveAgent.scope as WorkspaceId).title || getWorkspace(effectiveAgent.scope as WorkspaceId).name })
                        : t("works_in_all_workspaces")}
                    </p>
                  ) : null}
                  {agentInference ? (
                    <p
                      className="font-mono text-[10.5px] text-muted-foreground/70"
                      title={t("inference_identity")}
                    >
                      {agentInference}
                    </p>
                  ) : null}
                  {dateLabel ? (
                    <p className="text-xs text-muted-foreground/70">{dateLabel}</p>
                  ) : null}
                </div>
              </div>

              {aboveInput}

              <div className="w-full transition-all duration-300 ease-in-out">
                {inputArea}
              </div>

              {belowInput}

              {isAgentSession || agentWorkspaceId === "system" ? null : (
                <YulaAgentCards
                  workspaceId={agentWorkspaceId}
                  showAll={pathname === "/"}
                  onManage={(id) =>
                    router.push(
                      id ? `/system/agents?edit=${encodeURIComponent(id)}` : "/system/agents",
                    )
                  }
                />
              )}
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center px-4">
              <div className="mb-4 size-14">
                <YulaMarkIcon className="size-full" />
              </div>
              <h2 className="text-lg font-semibold tracking-tight text-primary dark:text-sidebar-primary">
                {t("yula_empty_title")}
              </h2>
              <p className="mt-1 max-w-md text-center text-sm text-muted-foreground">
                {introDescription}
              </p>
              {agentWorkspaceId === "system" ? null : (
                <YulaAgentCards
                  workspaceId={agentWorkspaceId}
                  showAll={pathname === "/"}
                  onManage={(id) =>
                    router.push(
                      id ? `/system/agents?edit=${encodeURIComponent(id)}` : "/system/agents",
                    )
                  }
                  className="mt-6"
                />
              )}
              <div className="mt-8 flex w-full justify-center">{inputArea}</div>
            </div>
          )
        ) : (
          <>
            <div
              ref={scrollRef}
              onScroll={onScroll}
              className="h-full overflow-y-auto overscroll-contain"
            >
              <div className="mx-auto w-full max-w-3xl space-y-2.5 px-3 py-2">
                {turns.map((turn, idx) => {
                  const isLast = idx === turns.length - 1
                  const isLiveTurn =
                    !queuedPrompt &&
                    (isLoading || yula.isTurnActive) &&
                    isLast;

                  const durationSec = turn.assistantMessage?.id
                    ? yula.responseDurations[turn.assistantMessage.id]
                    : undefined
                  const llmStepCount = turn.assistantMessage?.id
                    ? yula.llmStepCounts[turn.assistantMessage.id]
                    : undefined

                  return (
                    <YulaChatTurn
                      key={turn.id}
                      userMessage={turn.userMessage}
                      assistantMessage={turn.assistantMessage}
                      isLive={isLiveTurn}
                      durationSec={durationSec}
                      llmStepCount={llmStepCount}
                      tokenUsage={turn.assistantMessage?.metadata?.usage}
                      recoveredToolCallIds={recoveredToolCallIds}
                      onUndo={handleUndo}
                      conversationId={
                        queuedPrompt || !isLast ? undefined : yula.activeId
                      }
                    />
                  )
                })}
                {queuedPrompt ? (
                  <YulaChatTurn
                    key="yula-pending-prompt"
                    userMessage={
                      {
                        id: "yula-pending-user",
                        role: "user",
                        parts: [{ type: "text", text: queuedPrompt }],
                      } as YulaMessage
                    }
                    isLive
                    conversationId={yula.activeId}
                    recoveredToolCallIds={recoveredToolCallIds}
                  />
                ) : null}
              </div>
            </div>

            {!isAtBottom ? (
              <Button
                type="button"
                size="icon"
                variant="outline"
                className="absolute bottom-2 left-1/2 size-7 -translate-x-1/2 rounded-full bg-background shadow-md"
                onClick={() => scrollToBottom()}
                aria-label={t("scroll_down_aria")}
              >
                <ArrowDown className="size-3.5" />
              </Button>
            ) : null}
          </>
        )}
      </div>
      {!showCenteredIntro ? (
        <>
          {aboveInput}
          {inputArea}
        </>
      ) : null}
    </div>
  )

  if (isSearchingHistory || isHistoryOpen) {
    return isMainMode ? <YulaHistoryMainView /> : <YulaHistorySidebar />
  }

  if (isMainMode) {
    return (
      <div className="relative flex h-full min-h-0 flex-1 flex-col overflow-hidden">
        {chatPanelBody}
      </div>
    )
  }

  return chatPanelBody
}
