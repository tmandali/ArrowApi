import * as React from "react"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Separator } from "@/components/ui/separator"
import { Marker, MarkerContent } from "@/components/ui/marker"
import { WorkspaceSidePanelTrigger } from "@/components/layout/workspace-side-panel"
import { AiChatMessage } from "@/components/layout/ai-chat-message"
import { YulaMarkIcon } from "@/components/layout/yula-brand"
import { YULA } from "@/components/layout/yula-brand-data"
import {
  matchYulaCommands,
  type YulaCommand,
} from "@/components/layout/yula-commands"
import { useWorkspaceAiChat } from "@/context/workspace-ai-chat-context"
import { useAgentBridge, useAgentBridgeStore } from "@/hooks/useAgentBridge"
import type { UIMessage } from "ai"
import { workspaceLabelFromPath } from "@/lib/empty-module"
import { useLocation } from "react-router-dom"
import { cn } from "@/utils/cn"
import { YulaQuickActionChips } from "@/components/layout/yula-quick-chips"
import {
  ArrowDown,
  ArrowUp,
  Brain,
  FileText,
  Paperclip,
  Plus,
  SquarePen,
  X,
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
}

/** Toolbar control — opens the workspace docked AI panel. */
export function AIChatAssistant({
  className,
  separator = true,
}: AIChatAssistantProps = {}) {
  const { open, setOpen } = useWorkspaceAiChat()
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
        onOpenChange={setOpen}
        iconOnly
        icon={YulaMarkIcon}
        aria-label={YULA.ariaLabel}
        className={cn(
          "group/ai border-transparent bg-background text-primary shadow-none transition-all duration-200 hover:border-transparent hover:bg-background active:scale-95 [&_svg]:!size-5",
          open && "border-transparent bg-background hover:border-transparent"
        )}
      >
        <YulaMarkIcon className="relative size-5 transition-transform duration-200 group-hover/ai:scale-105" />
      </WorkspaceSidePanelTrigger>
    </div>
  )
}

export function AIChatPanelTitle() {
  return (
    <>
      <YulaMarkIcon className="size-5 shrink-0" />
      {YULA.name}
    </>
  )
}

/** Docked panel body — avatar-free chat box with attach + slash commands. */
export function AIChatPanel({
  centeredIntro = false,
}: {
  /** Centered Copilot-style intro until the user starts typing. */
  centeredIntro?: boolean
} = {}) {
  const { messages: bridgeMessages, isProcessing, streamingThinking, streamingContent, sendPrompt } = useAgentBridge()

  const messages = React.useMemo<UIMessage[]>(() => {
    const validMessages = bridgeMessages.filter((m) => m.id !== "init-1")
    // En son kriter kartı mesajının ID'sini bul (sadece en sonuncusu tam açık render edilecek)
    const lastCriteriaMsgId = [...validMessages]
      .reverse()
      .find((m) => m.customKind && m.customKind !== "yula_chart_card")?.id

    return validMessages.map((m) => {
      const parts: any[] = []
      const isLatestCriteria = !m.customKind || m.customKind === "yula_chart_card" || m.id === lastCriteriaMsgId

      // 0. Model Düşünme Çıktısı (Reasoning / Plan)
      if (m.thinking) {
        parts.push({
          type: "reasoning",
          text: m.thinking,
          meta: "thinking",
        })
      }

      // 1. Tool Call Reasoning (Sadece teknik argümanlar, mesaj metni tekrarlanmaz)
      if (m.isToolCall) {
        parts.push({
          type: "reasoning",
          meta: "tool-args",
          text: `Araç Parametreleri:\n${JSON.stringify(m.toolDetails || {}, null, 2)}`,
        })
      }

      // 2. Custom Kart olmayan başarılı araç sonuçları için teknik çıktı
      if (m.toolResult && !m.customKind && m.toolResult.status !== "error") {
        parts.push({
          type: "reasoning",
          meta: "tool-result",
          text: `Sonuç: ${JSON.stringify(m.toolResult, null, 2)}`,
        })
      }

      // 3. Kullanıcıya Yönelik Açıklama / Rehberlik Metni — TÜM mesajlarda görünür
      //    (eski kartların açıklamaları tarihte kaybolmaz)
      if (m.content) {
        parts.push({
          type: "text",
          text: m.content,
        })
      }

      // 4. Görsel Kart: Yalnızca en son aktif kriter formu render edilir
      if (m.customKind && isLatestCriteria) {
        parts.push({
          type: "custom",
          kind: m.customKind,
          data: m.toolResult,
          // AI (tool call) ile dolan kriterler — kartta satır vurgusu için.
          // Not: isToolCall bayrağı appendMessage'da set edilmediği için
          // toolDetails varlığından türetilir; kart mesajlarında toolResult
          // taşıyan kullanıcı "Çalıştır" bildirimleri toolDetails içermez.
          details: m.toolDetails ?? undefined,
        })
      }

      return {
        id: m.id,
        role: m.sender === "user" ? ("user" as const) : ("assistant" as const),
        parts,
      }
    }).filter((m) => m.role === "user" || m.parts.length > 0)
  }, [bridgeMessages])

  const [input, setInput] = React.useState("")
  const [attachments, setAttachments] = React.useState<AttachedFile[]>([])
  const [isAtBottom, setIsAtBottom] = React.useState(true)

  const scrollRef = React.useRef<HTMLDivElement>(null)
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const textareaRef = React.useRef<HTMLTextAreaElement>(null)

  const { pathname } = useLocation()
  const workspaceLabel = workspaceLabelFromPath(pathname)
  const introDescription = `${workspaceLabel} çalışma alanınızda — ${YULA.emptyDescription}`

  const isLoading = isProcessing
  const commandMatches = matchYulaCommands(input)
  const showCommands = commandMatches !== null
  const hasUserMessages = messages.some((message) => message.role === "user")
  const showCenteredIntro = centeredIntro && !hasUserMessages

  const scrollToBottom = React.useCallback((behavior: ScrollBehavior = "smooth") => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior })
  }, [])

  React.useEffect(() => {
    if (isAtBottom) scrollToBottom(isLoading ? "auto" : "smooth")
  }, [messages, isLoading, streamingThinking, streamingContent, isAtBottom, scrollToBottom])

  // Keep the cursor in the centered textbox while the intro is showing.
  React.useEffect(() => {
    if (showCenteredIntro) {
      requestAnimationFrame(() => textareaRef.current?.focus())
    }
  }, [showCenteredIntro])

  const onScroll = () => {
    const el = scrollRef.current
    if (!el) return
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight
    setIsAtBottom(distance < 48)
  }

  const newConversation = useAgentBridgeStore((s) => s.newConversation)

  const sendText = (text: string) => {
    const trimmed = text.trim()
    if (!trimmed && attachments.length === 0) return

    const lower = trimmed.toLowerCase()
    if (
      lower === "/new" ||
      lower === "/clear" ||
      lower === "/reset" ||
      lower === "/yeni"
    ) {
      newConversation()
      setInput("")
      setAttachments([])
      return
    }

    const attachmentNote =
      attachments.length > 0
        ? `\n\n[Ekler: ${attachments.map((file) => file.name).join(", ")}]`
        : ""

    void sendPrompt(`${trimmed}${attachmentNote}`.trim())
    setInput("")
    setAttachments([])
  }

  const handleSend = () => {
    if (isLoading) return
    const trimmed = input.trim()
    if (trimmed) sendText(trimmed)
  }

  const applyCommand = (command: YulaCommand) => {
    if (command.id === "new" || command.id === "clear") {
      newConversation()
      setInput("")
      return
    }
    setInput(command.prompt)
    requestAnimationFrame(() => textareaRef.current?.focus())
  }

  const onFilesSelected = (files: FileList | null) => {
    if (!files?.length) return
    const next = Array.from(files).map((file) => ({
      id: `${file.name}-${file.size}-${file.lastModified}`,
      name: file.name,
      size: file.size,
    }))
    setAttachments((current) => [...current, ...next].slice(0, 5))
  }

  const canSubmit =
    !isLoading && (Boolean(input.trim()) || attachments.length > 0)

  const inputArea = (
    <div className="relative mx-auto w-full max-w-3xl shrink-0 space-y-1.5 px-3 pb-2 pt-1.5">
      {showCommands ? (
        <div className="absolute inset-x-3 bottom-full z-20 mb-1.5 overflow-hidden rounded-xl border border-border/80 bg-popover/95 backdrop-blur-md shadow-lg">
          <Command shouldFilter={false} className="p-1">
            <CommandList className="max-h-48 overflow-y-auto no-scrollbar">
              <CommandEmpty className="py-2 text-[11px] text-muted-foreground text-center">
                Komut bulunamadı
              </CommandEmpty>
              <CommandGroup heading="Komutlar" className="p-0 **:[[cmdk-group-heading]]:px-2 **:[[cmdk-group-heading]]:py-0.5 **:[[cmdk-group-heading]]:text-[10px] **:[[cmdk-group-heading]]:font-semibold **:[[cmdk-group-heading]]:uppercase **:[[cmdk-group-heading]]:tracking-wider **:[[cmdk-group-heading]]:text-muted-foreground/70">
                {(commandMatches ?? []).map((command) => {
                  const Icon = command.icon
                  return (
                    <CommandItem
                      key={command.id}
                      value={command.slash}
                      onSelect={() => applyCommand(command)}
                      className="flex items-center gap-2 rounded-lg px-2 py-1 text-[11.5px] cursor-pointer min-h-0 data-selected:bg-accent hover:bg-accent/80 transition-colors"
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

      {attachments.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {attachments.map((file) => (
            <span
              key={file.id}
              className="inline-flex max-w-full items-center gap-1 rounded-full border bg-muted/40 px-2 py-0.5 text-[10px] text-muted-foreground"
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
        <textarea
          ref={textareaRef}
          value={input}
          rows={2}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault()
              if (showCommands && commandMatches?.[0]) {
                applyCommand(commandMatches[0])
                return
              }
              handleSend()
            }
            if (event.key === "Escape" && showCommands) {
              setInput("")
            }
          }}
          placeholder={YULA.placeholder}
          className="min-h-10 w-full resize-none border-0 bg-transparent px-2 py-1.5 text-[12px] leading-relaxed outline-none placeholder:text-muted-foreground"
        />

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
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="size-7 rounded-full text-muted-foreground"
                  aria-label="Ekle"
                >
                  <Plus className="size-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-44">
                <DropdownMenuItem onSelect={newConversation}>
                  <SquarePen className="size-3.5" />
                  Yeni sohbet (/new)
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => fileInputRef.current?.click()}
                >
                  <Paperclip className="size-3.5" />
                  Dosya ekle
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => setInput((value) => (value.startsWith("/") ? value : "/"))}
                >
                  / Komutlar
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <Button
            type="submit"
            size="icon"
            disabled={!canSubmit}
            className="size-7 rounded-full bg-gradient-to-br from-primary to-orange-500 text-primary-foreground hover:from-primary/90 hover:to-orange-500/90 transition-all"
            aria-label="Gönder"
          >
            <ArrowUp className="size-3.5" />
          </Button>
        </div>
      </form>

      <YulaQuickActionChips />
    </div>
  )

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="relative min-h-0 flex-1">
        {showCenteredIntro ? (
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
        ) : (
          <>
            <div
              ref={scrollRef}
              onScroll={onScroll}
              className="h-full overflow-y-auto overscroll-contain"
            >
              <div className="mx-auto w-full max-w-3xl space-y-2.5 px-3 py-2">
                {messages.map((message, idx) => {
                  const isLiveAssistant =
                    message.role === "assistant" && idx === messages.length - 1
                  return (
                    <AiChatMessage
                      key={message.id}
                      message={message}
                      isLive={isLiveAssistant}
                    />
                  )
                })}
                {isLoading && streamingThinking ? (
                  <Marker role="status" className="py-1">
                    <MarkerContent className="w-full items-start gap-2">
                      <span className="flex shrink-0 items-center gap-1.5 pt-0.5 text-xs font-medium text-muted-foreground">
                        <Brain className="size-3.5 shrink-0 animate-pulse text-orange-500/80 dark:text-orange-400/80" />
                        Düşünme Süreci
                      </span>
                      <span className="min-w-0 flex-1 whitespace-pre-wrap break-words border-l-2 border-orange-500/30 pl-3 text-left text-[11px] leading-relaxed text-muted-foreground dark:border-orange-400/30">
                        {streamingThinking}
                      </span>
                    </MarkerContent>
                  </Marker>
                ) : null}
                {isLoading && streamingContent ? (
                  <div className="px-3 py-1 text-[12px] leading-relaxed whitespace-pre-wrap break-words text-foreground">
                    {streamingContent}
                    <span className="ml-0.5 inline-block h-3 w-[2px] animate-pulse bg-foreground/60 align-middle" />
                  </div>
                ) : null}
                {isLoading && messages[messages.length - 1]?.role === "user" ? (
                  <Marker role="status" className="py-1 px-1 text-xs text-muted-foreground animate-in fade-in duration-200">
                    <MarkerContent className="flex items-center gap-1.5 font-medium text-foreground/80">
                      <span>Çalışıyor</span>
                      <span className="inline-flex gap-0.5 items-center">
                        <span className="size-1 rounded-full bg-orange-500 animate-bounce [animation-delay:-0.3s]" />
                        <span className="size-1 rounded-full bg-orange-500 animate-bounce [animation-delay:-0.15s]" />
                        <span className="size-1 rounded-full bg-orange-500 animate-bounce" />
                      </span>
                    </MarkerContent>
                  </Marker>
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
}
