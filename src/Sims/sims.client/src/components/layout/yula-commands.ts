import {
  RotateCcw,
  SquarePen,
  type LucideIcon,
} from "lucide-react"

export type YulaCommand = {
  id: string
  /** Slash trigger without leading slash, e.g. "stok" */
  slash: string
  label: string
  description: string
  /** Text inserted into the composer (or sent) when selected. */
  prompt: string
  /** When true, run the next scripted mock turn instead of freeform send. */
  runDemo?: boolean
  icon: LucideIcon
}

export const YULA_COMMANDS: YulaCommand[] = [
  {
    id: "new",
    slash: "new",
    label: "Yeni sohbet",
    description: "Mevcut konuşmayı ve bellek geçmişini sıfırla",
    prompt: "/new",
    icon: SquarePen,
  },
  {
    id: "clear",
    slash: "clear",
    label: "Sohbeti temizle",
    description: "Ekranı temizle ve yeni bir oturum başlat",
    prompt: "/clear",
    icon: RotateCcw,
  },
]

export function matchYulaCommands(input: string): YulaCommand[] | null {
  if (!input.startsWith("/")) return null
  const query = input.slice(1).trim().toLowerCase()
  if (!query) return YULA_COMMANDS
  return YULA_COMMANDS.filter(
    (command) =>
      command.slash.startsWith(query) ||
      command.label.toLowerCase().includes(query)
  )
}
