import type { UIMessage } from "ai"

export function firstTextPart(message: UIMessage | null | undefined): string {
  if (!message?.parts) return ""
  const textPart = message.parts.find((part) => part.type === "text")
  return textPart && "text" in textPart ? textPart.text : ""
}
