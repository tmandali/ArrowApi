import {
  BarChart3,
  ClipboardList,
  Package,
  Play,
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
    id: "stok",
    slash: "stok",
    label: "Stok analizi",
    description: "Stok analitik raporuna nasıl ulaşılır?",
    prompt: "Stok analizi raporu nasıl alınır?",
    icon: BarChart3,
  },
  {
    id: "satis",
    slash: "satis",
    label: "Satış siparişi",
    description: "Sipariş durumu nasıl güncellenir?",
    prompt: "Satış siparişinde durum nasıl güncellenir?",
    icon: ClipboardList,
  },
  {
    id: "maliyet",
    slash: "maliyet",
    label: "Maliyet fişi",
    description: "Landed cost ile ne takip edilir?",
    prompt: "Maliyet fişi ile neyi takip ederim?",
    icon: Package,
  },
  {
    id: "demo",
    slash: "demo",
    label: "Demo sorusu",
    description: "Önceden tanımlı mock diyaloğu ilerlet",
    prompt: "",
    runDemo: true,
    icon: Play,
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
