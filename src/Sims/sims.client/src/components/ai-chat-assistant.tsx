import * as React from "react"
import { useChat } from "@ai-sdk/react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { Sparkles, Send, Bot, User } from "lucide-react"

export function AIChatAssistant() {
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
    <Sheet>
      <SheetTrigger asChild>
        <Button
          size="icon"
          className="fixed bottom-5 right-5 z-50 shadow-xl rounded-full size-11 bg-primary text-primary-foreground hover:bg-primary/90 transition-transform hover:scale-105"
          aria-label="ERP AI Asistanı"
        >
          <Sparkles className="size-5 animate-pulse" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:w-[440px] flex flex-col p-0 gap-0">
        <SheetHeader className="p-4 border-b">
          <SheetTitle className="flex items-center gap-2 text-sm font-semibold">
            <Sparkles className="size-4 text-primary" />
            ERPNext AI Asistanı
          </SheetTitle>
        </SheetHeader>

        {/* Messages Stream Container */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground space-y-2 py-12">
              <Bot className="size-8 text-muted-foreground/50" />
              <p className="font-medium">ERP Systems AI Asistanına Hoş Geldiniz!</p>
              <p className="text-[11px] max-w-[260px]">
                Stok durumu, satış siparişleri veya finansal raporlar hakkında soru sorabilirsiniz.
              </p>
            </div>
          ) : (
            messages.map((m) => {
              const textContent = m.parts?.find((p) => p.type === "text")?.text || ""
              return (
                <div
                  key={m.id}
                  className={`flex items-start gap-2.5 ${
                    m.role === "user" ? "flex-row-reverse" : ""
                  }`}
                >
                  <div
                    className={`size-6 rounded-full flex items-center justify-center text-[10px] shrink-0 ${
                      m.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-foreground border"
                    }`}
                  >
                    {m.role === "user" ? (
                      <User className="size-3" />
                    ) : (
                      <Bot className="size-3 text-primary" />
                    )}
                  </div>
                  <div
                    className={`rounded-lg px-3 py-2 max-w-[80%] leading-relaxed ${
                      m.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted/50 border text-foreground"
                    }`}
                  >
                    {textContent}
                  </div>
                </div>
              )
            })
          )}
          {isLoading && (
            <div className="flex items-center gap-2 text-muted-foreground text-xs italic">
              <Bot className="size-3 animate-spin" />
              Yazıyor...
            </div>
          )}
        </div>

        {/* Input Form */}
        <form onSubmit={handleFormSubmit} className="p-3 border-t flex gap-2 bg-background">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Bir soru veya komut yazın..."
            className="h-9 text-xs flex-1 bg-muted/20"
          />
          <Button type="submit" size="icon" className="size-9 shrink-0" disabled={isLoading}>
            <Send className="size-3.5" />
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  )
}
