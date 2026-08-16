import type { UIMessage } from "ai"
import { Brain, Loader2 } from "lucide-react"

import { yulaCustomPartComponents } from "@/components/layout/yula-custom-parts"
import { cn } from "@/utils/cn"

type AiChatMessageProps = {
  message: UIMessage
  isProcessingLatest?: boolean
  className?: string
}

function ReasoningPart({ text }: { text: string }) {
  if (!text.trim()) return null

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
        <Brain className="size-3.5 shrink-0" />
        Reasoning
      </div>
      <div className="border-l-2 border-muted-foreground/25 pl-3 text-[11px] leading-relaxed text-muted-foreground">
        {text}
      </div>
    </div>
  )
}

function TextPart({
  text,
  role,
  isProcessingLatest,
}: {
  text: string
  role: UIMessage["role"]
  isProcessingLatest?: boolean
}) {
  if (!text) return null

  if (role === "user") {
    return (
      <div className="ml-auto flex items-center gap-2 max-w-[88%]">
        {isProcessingLatest ? (
          <Loader2 className="size-3.5 animate-spin text-primary shrink-0" />
        ) : null}
        <div className="rounded-xl bg-muted px-2.5 py-2 text-[12px] leading-relaxed text-foreground">
          {text}
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-[95%] text-[12px] leading-relaxed text-foreground whitespace-pre-wrap">
      {text}
    </div>
  )
}

/** Avatar-free message row — user bubble right, assistant text + reasoning left. */
export function AiChatMessage({
  message,
  isProcessingLatest,
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
          return <ReasoningPart key={`${message.id}-r-${index}`} text={part.text} />
        }
        if (part.type === "text") {
          return (
            <TextPart
              key={`${message.id}-t-${index}`}
              text={part.text}
              role={message.role}
              isProcessingLatest={isProcessingLatest}
            />
          )
        }
        if (part.type === "custom") {
          const CustomPart = yulaCustomPartComponents[part.kind]
          if (!CustomPart) return null
          return <CustomPart key={`${message.id}-c-${index}`} />
        }
        return null
      })}
    </div>
  )
}
