import { createChat } from "@shadcn/helpers/ai-sdk"
import type { UIMessage } from "ai"

/**
 * Predefined Yula conversation for local UI work without an AI backend.
 * Streams through the real useChat lifecycle via @shadcn/helpers/ai-sdk.
 */
export const yulaMockChat = createChat({
  messageIdPrefix: "yula-mock",
})
  .user("Stok analizi raporu nasıl alınır?")
  .sleep(400)
  .assistant(({ writer }) => {
    writer.reasoning(
      "Kullanıcı stok analitiği akışını soruyor. Menü yolu ve rapor adımlarını net vermeliyim."
    )
    writer.text(
      "Stok → Analitik sayfasından kriterleri seçip rapor oluşturabilirsiniz. İsterseniz adımları birlikte gezebiliriz."
    )
  })
  .user("Satış siparişinde durum nasıl güncellenir?")
  .sleep(350)
  .assistant(({ writer }) => {
    writer.reasoning(
      "Satış belgesi durum alanı header’da; taslak / onaylı / kapalı geçişlerini kısaca özetleyeceğim."
    )
    writer.text(
      "Satış belgesinde durum seçicisini kullanarak taslak, onaylı veya kapalı durumlarına geçebilirsiniz."
    )
  })
  .user("Maliyet fişi ile neyi takip ederim?")
  .sleep(350)
  .assistant(({ writer }) => {
    writer.reasoning(
      "Landed cost kapsamını ithalat ek maliyetleri ve birim maliyet dağıtımı üzerinden anlatacağım."
    )
    writer.text(
      "Landed cost (maliyet) fişi ile ithalat ve ek maliyetleri ürüne dağıtarak gerçek birim maliyeti netleştirirsiniz."
    )
  })

/** Empty start — scripted turns are sent via chat.next(). */
export const yulaMockInitialMessages: UIMessage[] = []

function lastUserText(messages: UIMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]
    if (message.role !== "user") continue
    const textPart = message.parts?.find((part) => part.type === "text")
    if (textPart && "text" in textPart) return textPart.text.trim()
  }
  return ""
}

/** Local transport: scripted replies + freeform fallback while AI API is unset. */
export function createYulaMockTransport() {
  return yulaMockChat.transport({
    delayMs: 28,
    fallback: ({ writer, messages }) => {
      const question = lastUserText(messages)
      writer.reasoning(
        "Canlı model yok; mock fallback ile UI akışını sürdürebilirim."
      )
      writer.text(
        question
          ? `Şimdilik mock moddayım (AI API bağlı değil). “${question.slice(0, 140)}” için canlı yanıt yok. \`/demo\` veya demo sorusu ile diyaloğu ilerletebilir, \`/\` ile komutları görebilirsiniz.`
          : "Şimdilik mock moddayım; gerçek AI bağlantısı henüz yok. `/` yazarak komutlara bakabilirsiniz.",
        { delayMs: 16 }
      )
    },
  })
}
