"use client";

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

const CHIP_GAP = 6
const MORE_BUTTON_WIDTH = 40

/**
 * Kapsayıcı genişliğini ResizeObserver ile ölçer; çip genişlikleri TAHMİN
 * yerine gizli ölçüm satırından gerçek offsetWidth ile alınır. Sığan kadar
 * çip gösterir, kalanları "⋯ N" dropdown'ında listeler.
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
  const measureRefs = React.useRef<Array<HTMLButtonElement | null>>([])
  const [availW, setAvailW] = React.useState<number | null>(null)
  const [widths, setWidths] = React.useState<number[] | null>(null)

  React.useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    setAvailW(el.clientWidth)
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width
      if (typeof w === "number") setAvailW(w)
    })
    ro.observe(el)
    // Font yüklendikten sonra genişlikler değişebilir → bir kez daha ölç
    document.fonts?.ready.then(() => setWidths((prev) => (prev ? [...prev] : prev)))
    return () => ro.disconnect()
  }, [])

  // Gizli ölçüm satırı mount edildikten sonra gerçek çip genişliklerini al
  React.useLayoutEffect(() => {
    const ws = measureRefs.current.slice(0, items.length).map((el) => el?.offsetWidth ?? 0)
    setWidths((prev) =>
      prev && prev.length === ws.length && prev.every((w, i) => w === ws[i])
        ? prev
        : ws,
    )
  }, [items])

  const visibleCount = React.useMemo(() => {
    if (!items.length) return 0
    if (availW == null || widths == null) return Math.min(items.length, Math.min(maxVisible, 3))
    let used = 0
    let count = 0
    for (let i = 0; i < items.length && i < maxVisible; i++) {
      const w = widths[i] ?? 0
      const reserve = i + 1 < items.length ? MORE_BUTTON_WIDTH : 0
      if (used + w + reserve > availW) break
      used += w + CHIP_GAP
      count++
    }
    // Hiçbiri sığmıyorsa bile ilk çipi göster (truncate ile), gerisi dropdown'da
    return Math.max(count, items.length > 1 || availW < MORE_BUTTON_WIDTH ? 1 : 0)
  }, [items, availW, widths, maxVisible])

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
      className={cn("relative flex min-w-0 items-center gap-1.5", className)}
    >
      {/* Gizli ölçüm satırı — gerçek çip genişliklerini offsetWidth ile verir */}
      <div
        aria-hidden
        className="pointer-events-none invisible absolute -top-40 left-0 flex gap-1.5"
      >
        {items.map((item, i) => {
          const Icon = item.icon
          return (
            <button
              key={`m-${i}`}
              ref={(el) => {
                measureRefs.current[i] = el
              }}
              type="button"
              tabIndex={-1}
              className={cn(chipClass, "max-w-none")}
            >
              {Icon ? <Icon className="size-2.5 shrink-0 text-primary" /> : null}
              <span className="whitespace-nowrap">{item.label}</span>
            </button>
          )
        })}
      </div>

      {visible.map((item, i) => {
        const Icon = item.icon
        return (
          <button
            key={`v-${i}`}
            type="button"
            onClick={() => onPick(item)}
            className={cn(chipClass, "min-w-0 max-w-full")}
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
