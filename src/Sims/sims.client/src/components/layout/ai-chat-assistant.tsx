import * as React from "react"
import { useChat } from "@ai-sdk/react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { WorkspaceSidePanelTrigger } from "@/components/layout/workspace-side-panel"
import { useWorkspaceAiChat } from "@/context/workspace-ai-chat"
import { cn } from "@/utils/cn"
import { Sparkles, Send, Bot, User } from "lucide-react"

type AIChatAssistantProps = {
  variant?: "toolbar" | "floating"
  className?: string
}

/** Toolbar / floating control — opens the workspace docked AI panel (Query Criteria pattern). */
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
        aria-label="ERP AI Asistanı"
      >
        <Sparkles className="size-5 animate-pulse" />
      </Button>
    )
  }

  return (
    <WorkspaceSidePanelTrigger
      open={open}
      onOpenChange={setOpen}
      iconOnly
      icon={Sparkles}
      aria-label="ERP AI Asistanı"
      className={cn(
        "group/ai relative overflow-hidden transition-all duration-300 hover:border-primary hover:bg-primary hover:text-primary-foreground hover:shadow-md hover:shadow-primary/25 active:scale-95",
        open && "border-primary bg-primary text-primary-foreground",
        className
      )}
    >
      <Sparkles className="relative size-3.5 transition-transform duration-300 group-hover/ai:scale-110 group-hover/ai:rotate-12" />
    </WorkspaceSidePanelTrigger>
  )
}

export function AIChatPanelTitle() {
  return (
    <>
      <Sparkles className="size-4 shrink-0 text-primary" />
      ERPNext AI Asistanı
    </>
  )
}

/** Docked panel body — rendered inside WorkspaceSidePanelLayout. */
export function AIChatPanel() {
  const { messages, status, sendMessage } = useChat()
  const [input, setInput] = React.useState("")

  const isLoading = status === "submitted" || status === "streaming"

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isLoading) return
    sendMessage({ role: "user", parts: [{ type: "text", text: input }] })
    setInput("")
  }

  return (
    <>
      <div className="flex-1 space-y-4 overflow-y-auto p-4 text-xs">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center space-y-2 py-12 text-center text-muted-foreground">
            <Bot className="size-8 text-muted-foreground/50" />
            <p className="font-medium">
              ERP Systems AI Asistanına Hoş Geldiniz!
            </p>
            <p className="max-w-[260px] text-[11px]">
              Stok durumu, satış siparişleri veya finansal raporlar hakkında soru
              sorabilirsiniz.
            </p>
          </div>
        ) : (
          messages.map((m) => {
            const textContent =
              m.parts?.find((p) => p.type === "text")?.text || ""
            return (
              <div
                key={m.id}
                className={`flex items-start gap-2.5 ${
                  m.role === "user" ? "flex-row-reverse" : ""
                }`}
              >
                <div
                  className={`flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] ${
                    m.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "border bg-muted text-foreground"
                  }`}
                >
                  {m.role === "user" ? (
                    <User className="size-3" />
                  ) : (
                    <Bot className="size-3 text-primary" />
                  )}
                </div>
                <div
                  className={`max-w-[80%] rounded-lg px-3 py-2 leading-relaxed ${
                    m.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "border bg-muted/50 text-foreground"
                  }`}
                >
                  {textContent}
                </div>
              </div>
            )
          })
        )}
        {isLoading && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground italic">
            <Bot className="size-3 animate-spin" />
            Yazıyor...
          </div>
        )}
      </div>

      <form
        onSubmit={handleFormSubmit}
        className="flex gap-2 border-t bg-background p-3"
      >
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Bir soru veya komut yazın..."
          className="h-9 flex-1 bg-muted/20 text-xs"
        />
        <Button
          type="submit"
          size="icon"
          className="size-9 shrink-0"
          disabled={isLoading}
        >
          <Send className="size-3.5" />
        </Button>
      </form>
    </>
  )
}
