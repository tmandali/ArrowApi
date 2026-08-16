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
import { env } from "@/config/env"
import { useLocation } from "react-router-dom"
import { cn } from "@/utils/cn"
import {
  ArrowDown,
  ArrowUp,
  FileText,
  Paperclip,
  Plus,
  SquarePen,
  X,
} from "lucide-react"

type AIChatAssistantProps = {
  variant?: "toolbar" | "floating"
  className?: string
  /** Vertical rule to the left of the toolbar control. */
  separator?: boolean
}


type AttachedFile = {
  id: string
  name: string
  size: number
}

/** Toolbar / floating control — opens the workspace docked AI panel. */
export function AIChatAssistant({
  variant = "toolbar",
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

  if (variant === "floating") {
    return (
      <Button
        type="button"
        size="icon"
        className={cn(
          "fixed bottom-5 right-5 z-50 size-11 rounded-full bg-primary text-primary-foreground shadow-xl transition-transform duration-300 hover:scale-105 hover:bg-primary/90",
          className
        )}
        onClick={() => setOpen(!open)}
        aria-pressed={open}
        aria-label={YULA.ariaLabel}
      >
        <YulaMarkIcon className="size-7 text-primary-foreground" glow />
      </Button>
    )
  }

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

/** Centered intro suggestions. */
const introSuggestions = [
  "Stock balance raporunu hazırla",
  "Stok analitik raporunu aç",
  "Geçen haftanın iptallerini göster",
]

/** Docked panel body — avatar-free chat box with attach + slash commands. */
export function AIChatPanel({
  centeredIntro = false,
}: {
  /** Centered Copilot-style intro until the user starts typing. */
  centeredIntro?: boolean
} = {}) {
  const { messages: bridgeMessages, isProcessing, sendPrompt } = useAgentBridge()

  const messages = React.useMemo<UIMessage[]>(() => {
    return bridgeMessages
      .filter((m) => m.id !== "init-1")
      .map((m) => {
        const parts: any[] = []
        if (m.isToolCall) {
          parts.push({
            type: "reasoning",
            text: `${m.content}\n${JSON.stringify(m.toolDetails || {}, null, 2)}`,
          })
        }
        if (m.customKind) {
          parts.push({
            type: "custom",
            kind: m.customKind,
          })
        }
        if (m.toolResult && !m.customKind) {
          parts.push({
            type: "reasoning",
            text: `Sonuç: ${JSON.stringify(m.toolResult, null, 2)}`,
          })
        }
        parts.push({
          type: "text",
          text: m.content,
        })
        return {
          id: m.id,
          role: m.sender === "user" ? ("user" as const) : ("assistant" as const),
          parts,
        }
      })
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
  }, [messages, isLoading, isAtBottom, scrollToBottom])

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

  const sendDemoOrText = () => {
    if (isLoading) return
    const trimmed = input.trim()
    if (trimmed) {
      sendText(trimmed)
      return
    }
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
        <div className="absolute inset-x-2 bottom-full z-20 mb-1 overflow-hidden rounded-lg border bg-popover shadow-lg">
          <Command shouldFilter={false} className="max-h-56">
            <CommandList>
              <CommandEmpty className="py-3 text-[11px]">
                Komut bulunamadı
              </CommandEmpty>
              <CommandGroup heading="Komutlar">
                {(commandMatches ?? []).map((command) => {
                  const Icon = command.icon
                  return (
                    <CommandItem
                      key={command.id}
                      value={command.slash}
                      onSelect={() => applyCommand(command)}
                    >
                      <Icon className="size-3.5 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">
                          /{command.slash}
                          <span className="ml-1.5 font-normal text-muted-foreground">
                            {command.label}
                          </span>
                        </div>
                        <div className="truncate text-[10px] text-muted-foreground">
                          {command.description}
                        </div>
                      </div>
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
          sendDemoOrText()
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
              sendDemoOrText()
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
            className="size-7 rounded-full bg-gradient-to-br from-primary to-orange-500 text-primary-foreground hover:from-primary/90 hover:to-orange-500/90"
            aria-label="Gönder"
          >
            <ArrowUp className="size-3.5" />
          </Button>
        </div>
      </form>
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
            <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
              {introSuggestions.map((suggestion) => (
                <Button
                  key={suggestion}
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 rounded-full px-3 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => sendText(suggestion)}
                >
                  {suggestion}
                </Button>
              ))}
            </div>
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
                  const isLatestUser =
                    isLoading &&
                    message.role === "user" &&
                    idx === messages.length - 1
                  return (
                    <AiChatMessage
                      key={message.id}
                      message={message}
                      isProcessingLatest={isLatestUser}
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
}
