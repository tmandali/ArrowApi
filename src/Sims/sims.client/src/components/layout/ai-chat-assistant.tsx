import * as React from "react"
import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport } from "ai"
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
import { WorkspaceSidePanelTrigger } from "@/components/layout/workspace-side-panel"
import {
  AiChatMessage,
  firstTextPart,
} from "@/components/layout/ai-chat-message"
import {
  YULA,
  YULA_WELCOME_MESSAGE,
  YulaMarkIcon,
} from "@/components/layout/yula-brand"
import {
  matchYulaCommands,
  type YulaCommand,
} from "@/components/layout/yula-commands"
import {
  createYulaMockTransport,
  yulaMockChat,
  yulaMockInitialMessages,
} from "@/components/layout/yula-mock-chat"
import { useWorkspaceAiChat } from "@/context/workspace-ai-chat"
import { env } from "@/config/env"
import { cn } from "@/utils/cn"
import {
  ArrowDown,
  ArrowUp,
  FileText,
  Paperclip,
  Plus,
  X,
} from "lucide-react"

type AIChatAssistantProps = {
  variant?: "toolbar" | "floating"
  className?: string
}

const isYulaMockMode = !env.aiChatApiUrl

type AttachedFile = {
  id: string
  name: string
  size: number
}

/** Toolbar / floating control — opens the workspace docked AI panel. */
export function AIChatAssistant({
  variant = "toolbar",
  className,
}: AIChatAssistantProps = {}) {
  const { open, setOpen } = useWorkspaceAiChat()

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

  return (
    <WorkspaceSidePanelTrigger
      open={open}
      onOpenChange={setOpen}
      iconOnly
      icon={YulaMarkIcon}
      aria-label={YULA.ariaLabel}
      className={cn(
        "group/ai relative overflow-hidden transition-all duration-300 hover:border-primary hover:bg-primary hover:text-primary-foreground hover:shadow-md hover:shadow-primary/25 active:scale-95 [&_svg]:!size-5 hover:[&_svg]:text-primary-foreground",
        open &&
          "border-primary bg-primary text-primary-foreground [&_svg]:text-primary-foreground",
        className
      )}
    >
      <YulaMarkIcon className="relative size-5 transition-transform duration-300 group-hover/ai:scale-105 group-hover/ai:text-primary-foreground" />
    </WorkspaceSidePanelTrigger>
  )
}

export function AIChatPanelTitle() {
  return (
    <>
      <YulaMarkIcon className="size-5 shrink-0 text-primary" />
      {YULA.name}
      {isYulaMockMode ? (
        <span className="ml-1 rounded-md border px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground">
          mock
        </span>
      ) : null}
    </>
  )
}

/** Docked panel body — avatar-free chat box with attach + slash commands. */
export function AIChatPanel() {
  const transport = React.useMemo(
    () =>
      isYulaMockMode
        ? createYulaMockTransport()
        : new DefaultChatTransport({ api: env.aiChatApiUrl }),
    []
  )

  const { messages, status, sendMessage } = useChat({
    messages: isYulaMockMode ? yulaMockInitialMessages : [YULA_WELCOME_MESSAGE],
    transport,
  })

  const [input, setInput] = React.useState("")
  const [attachments, setAttachments] = React.useState<AttachedFile[]>([])
  const [isAtBottom, setIsAtBottom] = React.useState(true)

  const scrollRef = React.useRef<HTMLDivElement>(null)
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const textareaRef = React.useRef<HTMLTextAreaElement>(null)

  const isLoading = status === "submitted" || status === "streaming"
  const nextMockMessage = isYulaMockMode ? yulaMockChat.next(messages) : null
  const nextMockText = firstTextPart(nextMockMessage)
  const commandMatches = matchYulaCommands(input)
  const showCommands = commandMatches !== null

  const scrollToBottom = React.useCallback((behavior: ScrollBehavior = "smooth") => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior })
  }, [])

  React.useEffect(() => {
    if (isAtBottom) scrollToBottom(isLoading ? "auto" : "smooth")
  }, [messages, isLoading, isAtBottom, scrollToBottom])

  const onScroll = () => {
    const el = scrollRef.current
    if (!el) return
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight
    setIsAtBottom(distance < 48)
  }

  const sendText = (text: string) => {
    const trimmed = text.trim()
    if (!trimmed && attachments.length === 0) return

    const attachmentNote =
      attachments.length > 0
        ? `\n\n[Ekler: ${attachments.map((file) => file.name).join(", ")}]`
        : ""

    void sendMessage({
      role: "user",
      parts: [{ type: "text", text: `${trimmed}${attachmentNote}`.trim() }],
    })
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
    if (nextMockMessage) void sendMessage(nextMockMessage)
  }

  const applyCommand = (command: YulaCommand) => {
    if (command.runDemo) {
      setInput("")
      if (nextMockMessage && !isLoading) void sendMessage(nextMockMessage)
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
    !isLoading && (Boolean(input.trim()) || Boolean(nextMockMessage) || attachments.length > 0)

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="relative min-h-0 flex-1">
        <div
          ref={scrollRef}
          onScroll={onScroll}
          className="h-full overflow-y-auto overscroll-contain"
        >
          <div className="mx-auto w-full max-w-3xl space-y-4 px-4 py-3 sm:px-6">
            <p className="text-center text-[12px] text-muted-foreground">
              {YULA.helpPrompt}
            </p>

            {messages.map((message) => (
              <AiChatMessage key={message.id} message={message} />
            ))}

            {isLoading ? (
              <p className="text-[11px] text-muted-foreground italic">
                {YULA.loading}
              </p>
            ) : null}
          </div>
        </div>

        {!isAtBottom ? (
          <Button
            type="button"
            size="icon"
            variant="outline"
            className="absolute bottom-3 left-1/2 size-8 -translate-x-1/2 rounded-full bg-background shadow-md"
            onClick={() => scrollToBottom()}
            aria-label="Alta kaydır"
          >
            <ArrowDown className="size-3.5" />
          </Button>
        ) : null}
      </div>

      {isYulaMockMode && nextMockText ? (
        <div className="mx-auto w-full max-w-3xl shrink-0 px-4 pb-1 sm:px-6">
          <button
            type="button"
            disabled={isLoading}
            className="w-full rounded-xl border border-dashed bg-muted/20 px-3 py-2 text-left text-[11px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground disabled:opacity-50"
            onClick={() => {
              if (!nextMockMessage || isLoading) return
              void sendMessage(nextMockMessage)
            }}
          >
            <span className="mb-0.5 block text-[10px] font-medium text-foreground/70">
              Demo sorusu
            </span>
            {nextMockText}
          </button>
        </div>
      ) : null}

      <div className="relative mx-auto w-full max-w-3xl shrink-0 space-y-2 px-4 py-3 pt-2 sm:px-6">
        {showCommands ? (
          <div className="absolute inset-x-3 bottom-full z-20 mb-1 overflow-hidden rounded-xl border bg-popover shadow-lg">
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
          className="rounded-2xl border bg-muted/25 p-2 shadow-sm focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/20"
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
            className="min-h-12 w-full resize-none border-0 bg-transparent px-2 py-1.5 text-[12px] leading-relaxed outline-none placeholder:text-muted-foreground"
          />

          <div className="flex items-center justify-between gap-2 px-0.5 pt-1">
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
                    className="size-8 rounded-full text-muted-foreground"
                    aria-label="Ekle"
                  >
                    <Plus className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-44">
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
              className="size-8 rounded-full"
              aria-label="Gönder"
            >
              <ArrowUp className="size-3.5" />
            </Button>
          </div>
        </form>

        {isYulaMockMode ? (
          <p className="px-1 text-[10px] text-muted-foreground/80">
            {YULA.mockHint}
          </p>
        ) : null}
      </div>
    </div>
  )
}
