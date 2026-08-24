import * as React from "react"
import { MoreHorizontal } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/utils/cn"

export interface PromptChipItem {
  label: string
  icon?: React.ComponentType<{ className?: string }>
}

const chipClass =
  "inline-flex shrink-0 items-center gap-1 rounded-full border border-border/70 bg-background px-2.5 py-0.5 text-[11px] font-medium text-foreground transition-all hover:border-primary/50 hover:bg-primary/5 hover:text-primary active:scale-95 cursor-pointer"

/** Çip genişlik tahmini: dolgu + ikon + 11px fontta karakter başına ~6.2px */
function estimateChipWidth(item: PromptChipItem): number {
  return (
    24 +
    (item.icon ? 14 : 0) +
    Math.min(item.label.length, 18) * 6.2 +
    8 /* güvenlik payı */
  )
}

const MORE_BUTTON_WIDTH = 46

/**
 * Kapsayıcı genişliğini ResizeObserver ile ölçer; sığan kadar çip gösterir,
 * kalanları "⋯ N" dropdown'ında listeler. maxVisible verilirse üst sınır olur.
 */
export function PromptChipsRow({
  items,
  onPick,
  maxVisible = Number.POSITIVE_INFINITY,
  className,
}: {
  items: PromptChipItem[]
  onPick: (item: PromptChipItem) => void
  /** Genişlik ne kadar kaldırırsa kaldırsın gösterilecek en fazla çip sayısı */
  maxVisible?: number
  className?: string
}) {
  const wrapRef = React.useRef<HTMLDivElement>(null)
  const [availW, setAvailW] = React.useState<number | null>(null)

  React.useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    setAvailW(el.clientWidth)
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width
      if (typeof w === "number") setAvailW(w)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const visibleCount = React.useMemo(() => {
    if (!items.length) return 0
    if (availW == null) return Math.min(items.length, Math.min(maxVisible, 4))
    let used = 0
    let count = 0
    for (let i = 0; i < items.length && i < maxVisible; i++) {
      const w = estimateChipWidth(items[i]!)
      const willOverflowLater = i + 1 < items.length
      const budget =
        availW - (willOverflowLater || i < items.length - 1 ? MORE_BUTTON_WIDTH : 0)
      if (used + w > budget) break
      used += w
      count++
    }
    // Hiçbiri sığmıyorsa bile ilk çipi göster (truncate ile), gerisi dropdown'da
    return Math.max(count, items.length > 1 || availW < MORE_BUTTON_WIDTH ? 1 : 0)
  }, [items, availW, maxVisible])

  const visible = React.useMemo(
    () => items.slice(0, visibleCount),
    [items, visibleCount]
  )
  const hidden = React.useMemo(
    () => items.slice(visibleCount),
    [items, visibleCount]
  )

  if (items.length === 0) return null

  return (
    <div
      ref={wrapRef}
      className={cn("flex min-w-0 items-center gap-1.5", className)}
    >
      {visible.map((item, i) => {
        const Icon = item.icon
        return (
          <button
            key={`v-${i}`}
            type="button"
            onClick={() => onPick(item)}
            className={cn(chipClass, "max-w-full")}
            title={item.label}
          >
            {Icon ? <Icon className="size-2.5 shrink-0 text-primary" /> : null}
            <span className="truncate">{item.label}</span>
          </button>
        )
      })}

      {hidden.length > 0 ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={`${hidden.length} öneri daha`}
              title={`${hidden.length} öneri daha`}
              className={cn(chipClass, "shrink-0 px-2")}
            >
              <MoreHorizontal className="size-3.5 text-muted-foreground" />
              <span className="text-[10px] tabular-nums text-muted-foreground">
                {hidden.length}
              </span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-72 w-64 overflow-y-auto">
            {hidden.map((item, i) => {
              const Icon = item.icon
              return (
                <DropdownMenuItem key={`h-${i}`} onSelect={() => onPick(item)}>
                  {Icon ? <Icon className="size-3.5 text-primary" /> : null}
                  <span className="truncate">{item.label}</span>
                </DropdownMenuItem>
              )
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  )
}
