"use client";

import { usePathname, useRouter } from "next/navigation";
import * as React from "react"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Separator } from "@/components/ui/separator"
import { Marker, MarkerContent } from "@/components/ui/marker"
import { WorkspaceSidePanelTrigger } from "@/components/layout/workspace-side-panel"
import { YulaChatTurn } from "@/components/layout/yula-chat-turn"
import { AiChatMessage } from "@/components/layout/ai-chat-message"
import { ToolResultTable } from "@/components/layout/tool-result-table"
import { YulaChartCard } from "@/components/layout/yula-chart-card"
import { ToolExecPanel } from "@/components/layout/tool-exec-panel"
import { stripMarkdownTables } from "@/lib/markdown-table-strip"
import { YulaMarkIcon } from "@/components/layout/yula-brand"
import { WorkspaceHomeCards } from "@/components/layout/workspace-home-cards"
import { YULA } from "@/components/layout/yula-brand-data"
import { YulaModelSelector } from "@/components/layout/yula-model-selector"
import {
  getAllYulaCommands,
  matchYulaCommands,
  type YulaCommand,
} from "@/components/layout/yula-commands"
import { useYulaGridStore } from "@/lib/stores/grid"
import { useChatsStore } from "@/lib/stores/chats"
import { YulaHistorySidebar, YulaHistoryMainView } from "@/components/layout/yula-history-sidebar"
import { useWorkspaceAiChat } from "@/context/workspace-ai-chat-context"
import {
  useYulaChat,
  yulaToolPartInfo,
  type YulaToolPartInfo,
} from "@/hooks/use-yula-chat"
import type { YulaMessage, YulaTools } from "@/app/api/agent/chat/route"
import { formatPathnameLabel, isWorkspaceHomePath, workspaceLabelFromPath, isReportResultView } from "@/lib/workspace-paths"
import { cn } from "@/utils/cn"
import {
  ArrowDown,
  ArrowUp,
  Brain,
  ChevronDown,
  FileCode,
  FileText,
  Paperclip,
  Plus,
  Puzzle,
  RotateCcw,
  Square,
  SquarePen,
  X,
  ShieldAlert,
  CheckCircle2,
  Zap,
} from "lucide-react"

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
  const router = useRouter()
  const { open, setOpen } = useWorkspaceAiChat()
  const { newConversation } = useYulaChat()
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
      newConversation()
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
        aria-label={isHomePage ? "Yeni Sohbet Başlat" : YULA.ariaLabel}
        title={isHomePage ? "Yeni Sohbet Başlat" : YULA.name}
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


function toolRunSummary(info: {
  toolName: string
  state: string
  input?: unknown
  output?: unknown
  errorText?: string
}): string | undefined {
  // SDK kanonik hata parçası: state:"output-error" → errorText taşıyıcısıdır
  if (info.state === "output-error" && info.errorText) {
    return info.errorText
  }
  const out =
    typeof info.output === "object" && info.output !== null
      ? (info.output as Record<string, unknown>)
      : undefined
  if (out?.message) return String(out.message)
  if (out?.error) return String(out.error)
  if (out?.hint) return String(out.hint)
  if (Array.isArray(out?.errors) && out.errors.length > 0) {
    return out.errors.map(String).join(" · ")
  }
  return undefined
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
    Boolean(out?.error)
  )
}

/**
 * Bekleyen araç çağrısı için insan-okur aksiyon etiketi — "Çalışıyor" yerine
 * ne yapıldığını yazar (örn. "Tablo profili çıkarılıyor…").
 */
function toolActionLabel(info: {
  toolName: string
  input?: unknown
}): string {
  const input =
    typeof info.input === "object" && info.input !== null
      ? (info.input as Record<string, unknown>)
      : {}
  switch (info.toolName) {
    case "profile_grid_table":
      return "Tablo profili çıkarılıyor"
    case "run_expert_sql": {
      const sql =
        typeof input.sql === "string" ? input.sql.replace(/\s+/g, " ").trim() : ""
      const short = sql.length > 70 ? `${sql.slice(0, 70)}…` : sql
      return short ? `SQL çalıştırılıyor: ${short}` : "SQL sorgusu çalıştırılıyor"
    }
    case "filter_current_grid": {
      const field = typeof input.field === "string" ? input.field : ""
      const value = typeof input.value === "string" ? input.value.trim() : ""
      if (field === "*") return "Filtreler temizleniyor"
      return field
        ? value
          ? `Filtre uygulanıyor: ${field} = ${value}`
          : `Filtre uygulanıyor: ${field}`
        : "Filtre uygulanıyor"
    }
    case "analyze_grid_data": {
      const op = typeof input.operation === "string" ? input.operation : ""
      return op ? `Tablo analizi: ${op}` : "Tablo analizi yürütülüyor"
    }
    case "set_grid_query": {
      const title = typeof input.title === "string" ? input.title.trim() : ""
      return title ? `Grid yenileniyor: ${title}` : "Grid görünümü yenileniyor"
    }
    case "visualize_grid_data": {
      const title = typeof input.title === "string" ? input.title.trim() : ""
      return title ? `Grafik hazırlanıyor: ${title}` : "Grafik görselleştiriliyor"
    }
    case "run_report": {
      const report = typeof input.report === "string" ? input.report : ""
      return report ? `Rapor çalıştırılıyor: ${report}` : "Rapor çalıştırılıyor"
    }
    default:
      return "Çalışıyor"
  }
}

function ToolExecLine({
  state,
  summary,
  actionLabel,
  isError,
}: {
  state: string
  summary?: string
  actionLabel?: string
  isError?: boolean
}) {
  if (state === "output-available" || state === "output-error") {
    // Sadece gerçek yürütüm hatası varsa kullanıcıya mesaj gösterilir.
    // Başarılı araçların teknik mesajı "Araç Çalıştırma" katlanabilir akordeon bloğunda kalır.
    if (isError && summary) {
      return (
        <p className="whitespace-pre-wrap break-words text-[12px] leading-relaxed text-red-600 dark:text-red-400 font-medium py-0.5">
          {summary}
        </p>
      )
    }
    return null
  }

  return (
    <Marker role="status" className="py-0.5">
      <MarkerContent className="items-start gap-1.5">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
          <span className="size-1 rounded-full bg-orange-500 animate-bounce" />
          {actionLabel ?? "Çalışıyor"}…
        </span>
      </MarkerContent>
    </Marker>
  )
}


function YulaConfirmationCard({ info }: { info: YulaToolPartInfo }) {
  const yula = useYulaChat()
  const input = (info.input as {
    title?: string
    message?: string
    actionType?: string
    details?: Record<string, unknown>
  } | null) ?? {}

  const output = (info.output as {
    confirmed?: boolean
    message?: string
  } | null) ?? null

  const isPending = info.state === "input-available"

  const handleConfirm = () => {
    yula.addToolOutput({
      tool: "request_user_confirmation" as keyof YulaTools,
      toolCallId: info.toolCallId,
      state: "output-available",
      output: {
        confirmed: true,
        message: "İşlem kullanıcı tarafından onaylandı.",
      },
    })
  }

  const handleCancel = () => {
    yula.addToolOutput({
      tool: "request_user_confirmation" as keyof YulaTools,
      toolCallId: info.toolCallId,
      state: "output-available",
      output: {
        confirmed: false,
        message: "İşlem kullanıcı tarafından iptal edildi.",
      },
    })
  }

  return (
    <div className="my-2.5 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3.5 space-y-2.5 backdrop-blur-md shadow-sm">
      <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 font-semibold text-xs">
        <ShieldAlert className="size-4 shrink-0 text-amber-500 animate-pulse" />
        <span>{input.title || "İşlem Onayı Gerekiyor"}</span>
      </div>

      <p className="text-xs text-foreground/90 leading-relaxed">
        {input.message || "Bu işlem için kullanıcı onayı gerekmektedir."}
      </p>

      {input.details && Object.keys(input.details).length > 0 && (
        <div className="rounded-lg border border-border/50 bg-background/70 p-2 text-[11px] space-y-1 font-mono">
          {Object.entries(input.details).map(([k, v]) => (
            <div key={k} className="flex justify-between gap-2">
              <span className="text-muted-foreground">{k}:</span>
              <span className="font-semibold text-foreground">{String(v)}</span>
            </div>
          ))}
        </div>
      )}

      {isPending ? (
        <div className="flex items-center gap-2 pt-1">
          <Button
            size="sm"
            className="h-8 gap-1.5 bg-amber-600 hover:bg-amber-700 text-white font-medium text-xs px-3.5 shadow-sm"
            onClick={handleConfirm}
          >
            <CheckCircle2 className="size-3.5" />
            İşlemi Onayla
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1 text-xs border-border/70 hover:bg-accent"
            onClick={handleCancel}
          >
            <X className="size-3.5" />
            İptal Et
          </Button>
        </div>
      ) : (
        <div className="pt-1 flex items-center gap-1.5 text-xs font-medium">
          {output?.confirmed ? (
            <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="size-3.5" />
              İşlem Onaylandı
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400">
              <X className="size-3.5" />
              İşlem Kullanıcı Tarafından İptal Edildi
            </span>
          )}
        </div>
      )}
    </div>
  )
}

import {
  greetingFor,
  formatDate,
  useMounted,
  WelcomeShortcutCards,
} from "@/components/app/welcome-screen"
import { YulaQuickActionChips } from "@/components/layout/yula-quick-chips"

export function AIChatPanelTitle() {
  const activeId = useChatsStore((s) => s.activeId)
  const conversations = useChatsStore((s) => s.conversations)
  const isHistoryOpen = useChatsStore((s) => s.isHistoryOpen)
  const isSearchingHistory = useChatsStore((s) => s.isSearchingHistory)
  const pathname = usePathname()

  const activeConv = React.useMemo(
    () => conversations.find((c) => c.id === activeId),
    [conversations, activeId]
  )

  const screenLabel = formatPathnameLabel(pathname) || "Ekran"

  let titleText: string = YULA.name
  if (isHistoryOpen || isSearchingHistory) {
    titleText = isWorkspaceHomePath(pathname) ? "Sohbet Geçmişi" : `${screenLabel} Yazışmaları`
  } else if (activeConv?.title) {
    titleText = activeConv.title
  }

  return (
    <div className="flex min-w-0 items-center gap-1.5 truncate">
      <YulaMarkIcon className="size-5 shrink-0" />
      <span className="truncate text-xs font-semibold">{titleText}</span>
    </div>
  )
}

type AIChatPanelProps = {
  /** Centered Copilot-style intro until the user starts typing. */
  centeredIntro?: boolean
  /** View mode: "main" (Ana Ekran full-width) or "dock" (Right side panel). Auto-detected if omitted. */
  mode?: "main" | "dock"
}

/** Docked or main screen panel body — avatar-free chat box with attach + slash commands. */
export function AIChatPanel({
  centeredIntro = false,
  mode,
}: AIChatPanelProps = {}) {
  const isSearchingHistory = useChatsStore((s) => s.isSearchingHistory)
  const yula = useYulaChat()
  const status = yula.status
  const isProcessing = yula.busy
  const sendPrompt = yula.sendMessageText
  const { messages } = yula

  // SDK geçişlerinde (stream + persist rehydrate) aynı id'li mesaj dizide
  // iki kez bulunabilir → React key çakışması ve çift balon render'ı.
  // Render öncesi id'ye göre tekilleştir (SON kopya en taze durumudur).
  const dedupedMessages = React.useMemo(() => {
    const lastById = new Map<string, number>()
    messages.forEach((m, i) => lastById.set(m.id, i))
    if (lastById.size === messages.length) return messages
    return messages.filter((m, i) => lastById.get(m.id) === i)
  }, [messages])

  // Sohbet mesajlarını Soru-Cevap turlarına (YulaChatTurn) grupla
  const turns = React.useMemo(() => {
    const list: Array<{
      id: string
      userMessage?: YulaMessage
      assistantMessage?: YulaMessage
    }> = []

    let currentTurn: {
      id: string
      userMessage?: YulaMessage
      assistantMessage?: YulaMessage
    } | null = null

    for (const m of dedupedMessages) {
      if (m.role === "user") {
        if (currentTurn) {
          list.push(currentTurn)
        }
        currentTurn = { id: m.id, userMessage: m }
      } else if (m.role === "assistant") {
        if (currentTurn) {
          currentTurn.assistantMessage = m
          list.push(currentTurn)
          currentTurn = null
        } else {
          list.push({ id: m.id, assistantMessage: m })
        }
      }
    }
    if (currentTurn) {
      list.push(currentTurn)
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
  const isHomePath = isWorkspaceHomePath(pathname)
  const isMainMode = mode ? mode === "main" : isHomePath
  const isHistoryOpen = useChatsStore((s) => s.isHistoryOpen)

  const mounted = useMounted()
  const now = React.useMemo(() => new Date(), [])
  const greeting = mounted ? greetingFor(now) : "Hoş geldiniz"
  const dateLabel = mounted ? formatDate(now) : null

  const workspaceLabel = workspaceLabelFromPath(pathname)
  const introDescription = `${workspaceLabel} çalışma alanınızda — ${YULA.emptyDescription}`

  const isLoading = isProcessing
  const spec = useYulaGridStore((s) => s.spec)
  const isViewingResults = isReportResultView(pathname, spec)
  const allCommands = React.useMemo(() => getAllYulaCommands(isViewingResults, pathname), [isViewingResults, pathname])
  const commandMatches = matchYulaCommands(input, allCommands)
  const showCommands = input.startsWith("/") && commandMatches !== null && commandMatches.length > 0
  const hasUserMessages = messages.some((message) => message.role === "user")
  const showCenteredIntro = (centeredIntro || (isMainMode && isHomePath)) && !hasUserMessages

  React.useEffect(() => {
    setSelectedIndex(0)
  }, [input])

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
      return
    }

    if (selectedCommand?.id === "new" || trimmed.toLowerCase() === "/new") {
      newConversation()
      setInput("")
      setSelectedCommand(null)
      setPastedChip(null)
      setAttachments([])
      return
    }

    let finalPrompt = ""
    if (promptPrefix) {
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
  }

  const handleSend = () => {
    if (isLoading) return
    sendText(input)
  }

  const applyCommand = (command: YulaCommand) => {
    if (command.id === "new") {
      newConversation()
      setInput("")
      setSelectedCommand(null)
      setPastedChip(null)
      return
    }
    if (command.id === "attach" || command.slash === "dosya") {
      fileInputRef.current?.click()
      setInput("")
      setSelectedCommand(null)
      setPastedChip(null)
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
    !isLoading &&
    (Boolean(input.trim()) ||
      Boolean(selectedCommand) ||
      Boolean(pastedChip) ||
      attachments.length > 0)

  const inputArea = (
    <div className="relative mx-auto w-full max-w-3xl shrink-0 space-y-1.5 px-3 pb-2 pt-1.5">
      {showCommands ? (
        <div className="absolute inset-x-3 bottom-full z-20 mb-1.5 overflow-hidden rounded-xl border border-border/80 bg-popover/95 backdrop-blur-md shadow-lg">
          <Command shouldFilter={false} className="p-1">
            <CommandList className="max-h-48 overflow-y-auto no-scrollbar">
              <CommandEmpty className="py-2 text-[11px] text-muted-foreground text-center">
                Komut bulunamadı
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
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </div>
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
                aria-label={`${file.name} ekini kaldır`}
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
              if (showCommands && commandMatches && commandMatches.length > 0) {
                if (event.key === "ArrowDown") {
                  event.preventDefault()
                  setSelectedIndex((prev) => (prev + 1) % commandMatches.length)
                  return
                }
                if (event.key === "ArrowUp") {
                  event.preventDefault()
                  setSelectedIndex((prev) => (prev - 1 + commandMatches.length) % commandMatches.length)
                  return
                }
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault()
                  const targetCmd = commandMatches[selectedIndex] ?? commandMatches[0]
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
                  ? `Paste (${lines.length} satır)`
                  : `Paste (${pastedText.trim().length} karakter)`

                setPastedChip({
                  id: `paste-${Date.now()}`,
                  content: pastedText,
                  preview,
                })
              }
            }}
            placeholder={
              selectedCommand || pastedChip
                ? "Ek mesaj veya parametre yazın..."
                : YULA.placeholder
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
              aria-label="Komutlar (+)"
              title="Komut listesini göster (+)"
            >
              <Plus className="size-3.5" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-7 rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              onClick={() => fileInputRef.current?.click()}
              aria-label="Dosya ekle"
              title="Dosya ekle"
            >
              <Paperclip className="size-3.5" />
            </Button>

            <div className="h-3.5 w-px bg-border/60 mx-1 shrink-0 self-center" aria-hidden="true" />

            <YulaModelSelector />
          </div>

          {isLoading ? (
            <Button
              type="button"
              size="icon"
              onClick={() => void yula.stop()}
              className="size-7 rounded-full border border-red-500/40 bg-red-500/10 text-red-600 hover:bg-red-500/20 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 transition-all"
              aria-label="Durdur"
              title="Durdur"
            >
              <Square className="size-3 fill-current" />
            </Button>
          ) : (
            <Button
              type="submit"
              size="icon"
              disabled={!canSubmit}
              className="size-7 rounded-full bg-gradient-to-br from-primary to-orange-500 text-primary-foreground hover:from-primary/90 hover:to-orange-500/90 transition-all"
              aria-label="Gönder"
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
            <div className="mx-auto flex h-full w-full max-w-3xl flex-col items-center justify-center gap-6 py-8 px-4 overflow-y-auto no-scrollbar animate-in fade-in duration-300">
              <div className="flex flex-col items-center gap-4 text-center">
                <YulaMarkIcon className="size-14" />
                <div className="space-y-1.5">
                  <h1 className="text-3xl font-bold tracking-tight">{greeting}</h1>
                  <p className="text-sm text-muted-foreground">
                    Yula, yerel Ollama üzerinde akan yapay zekâ asistanın.
                  </p>
                  {dateLabel ? (
                    <p className="text-xs text-muted-foreground/70">{dateLabel}</p>
                  ) : null}
                </div>
              </div>

              <div className="w-full transition-all duration-300 ease-in-out">
                {inputArea}
              </div>

              <WorkspaceHomeCards />
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center px-4">
              <div className="mb-4 size-14">
                <YulaMarkIcon className="size-full" />
              </div>
              <h2 className="text-lg font-semibold tracking-tight text-primary dark:text-sidebar-primary">
                {YULA.emptyTitle}
              </h2>
              <p className="mt-1 max-w-md text-center text-sm text-muted-foreground">
                {introDescription}
              </p>
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
                  const isLiveTurn =
                    (isLoading || yula.isTurnActive) &&
                    idx === turns.length - 1 &&
                    (!turn.assistantMessage ||
                      turn.assistantMessage.id === lastAssistant?.id)

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
                      recoveredToolCallIds={recoveredToolCallIds}
                      onUndo={handleUndo}
                    />
                  )
                })}
              </div>
            </div>

            {!isAtBottom ? (
              <Button
                type="button"
                size="icon"
                variant="outline"
                className="absolute bottom-2 left-1/2 size-7 -translate-x-1/2 rounded-full bg-background shadow-md"
                onClick={() => scrollToBottom()}
                aria-label="Alta kaydır"
              >
                <ArrowDown className="size-3.5" />
              </Button>
            ) : null}
          </>
        )}
      </div>
      {!showCenteredIntro ? inputArea : null}
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
