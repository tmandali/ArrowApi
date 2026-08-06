import { cn } from "@/utils/cn"
import type { UIMessage } from "ai"

/** YULA product copy — single source for AI assistant branding. */
export const YULA = {
  name: "Yula",
  nameBrand: "YULA",
  slogan: "LCW ERP’de dijital rehberiniz.",
  openingMessage:
    "Merhaba, ben Yula — LCW ERP süreçlerinde dijital rehberiniz. Bugün neyi netleştirmemi istersiniz?",
  emptyTitle: "Yula ile başlayın",
  emptyDescription: "Stok, satış, maliyet veya raporlar hakkında soru sorun.",
  helpPrompt: "Bugün size nasıl yardımcı olabilirim?",
  mockHint: "Mock mod — AI API yok; demo diyaloğu veya serbest metinle UI geliştirebilirsiniz.",
  ariaLabel: "Yula — AI asistan",
  placeholder: "Mesaj yazın, / ile komut…",
  loading: "Yula yazıyor…",
  collapseLabel: "Yula panelini kapat",
  expandLabel: "Yula’yı tam içeriğe genişlet",
  restoreLabel: "Yula’yı yan panele küçült",
  welcomeMessageId: "yula-welcome",
} as const

export const YULA_WELCOME_MESSAGE: UIMessage = {
  id: YULA.welcomeMessageId,
  role: "assistant",
  parts: [{ type: "text", text: YULA.openingMessage }],
}

type YulaMarkIconProps = {
  className?: string
  /** Soft glow ring — use on empty / hero moments. */
  glow?: boolean
}

/** AI sparkles mark — edge-to-edge in the viewBox (currentColor → default primary). */
export function YulaMarkIcon({ className, glow = false }: YulaMarkIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("block size-full shrink-0 text-primary", className)}
      aria-hidden
    >
      {glow ? (
        <circle cx="12" cy="12" r="12" className="opacity-[0.12]" />
      ) : null}

      {/* Primary spark — touches all four edges */}
      <path d="M12 0 15.4 8.6 24 12 15.4 15.4 12 24 8.6 15.4 0 12 8.6 8.6Z" />
      {/* Secondary spark — top-right corner */}
      <path
        d="M19.2 0.4 20.7 4 24 5.5 20.7 7 19.2 10.6 17.7 7 14.1 5.5 17.7 4Z"
        className="opacity-95"
      />
      {/* Tertiary spark — bottom-left corner */}
      <path
        d="M4.8 13.4 5.9 16.1 8.6 17.2 5.9 18.3 4.8 21 3.7 18.3 1 17.2 3.7 16.1Z"
        className="opacity-90"
      />
    </svg>
  )
}
