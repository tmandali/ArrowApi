import * as React from "react"

export const chipClass =
  "flex h-[calc(--spacing(4.75))] w-fit max-w-28 shrink-0 items-center justify-center gap-1 rounded-[calc(var(--radius-sm)-2px)] bg-muted-foreground/10 px-1.5 text-xs/relaxed font-medium text-foreground"

export const CHIP_GAP_PX = 4
/** Keep a small caret; do not reserve a full empty input width or chips under-fit. */
export const INPUT_CARET_PX = 24

export function useFitChipCount(
  containerRef: React.RefObject<HTMLElement | null>,
  itemCount: number,
  itemKey: string
) {
  const measureRef = React.useRef<HTMLDivElement>(null)
  const [visibleCount, setVisibleCount] = React.useState(itemCount)

  const recalculate = React.useCallback(() => {
    const container = containerRef.current
    const measure = measureRef.current
    if (!container || !measure || itemCount === 0) {
      setVisibleCount(itemCount)
      return
    }

    const chips = Array.from(
      measure.querySelectorAll<HTMLElement>("[data-measure-chip]")
    )
    if (chips.length === 0) {
      setVisibleCount(0)
      return
    }

    const moreEl = measure.querySelector<HTMLElement>("[data-measure-more]")
    const trailing = container.querySelector<HTMLElement>("[data-chip-trailing]")
    const styles = window.getComputedStyle(container)
    const padX =
      (Number.parseFloat(styles.paddingLeft) || 0) +
      (Number.parseFloat(styles.paddingRight) || 0)
    const trailingWidth = trailing?.getBoundingClientRect().width ?? 0
    const available = Math.max(
      0,
      container.clientWidth - padX - trailingWidth - INPUT_CARET_PX
    )

    const chipWidths = chips.map((chip) => chip.getBoundingClientRect().width)
    const moreWidthFor = (hidden: number) => {
      if (!moreEl || hidden <= 0) return 0
      moreEl.textContent = `+${hidden}`
      return Math.max(moreEl.getBoundingClientRect().width, 28)
    }

    let best = 0
    for (let count = 0; count <= itemCount; count += 1) {
      let used = 0
      for (let index = 0; index < count; index += 1) {
        used += chipWidths[index]! + (index > 0 ? CHIP_GAP_PX : 0)
      }
      const hidden = itemCount - count
      if (hidden > 0) {
        used += (count > 0 ? CHIP_GAP_PX : 0) + moreWidthFor(hidden)
      }
      if (used <= available + 0.5) {
        best = count
      } else {
        break
      }
    }

    setVisibleCount(best)
  }, [containerRef, itemCount])

  React.useLayoutEffect(() => {
    recalculate()
    // Second pass after layout/fonts settle (chip widths can be 0 on first paint).
    const frame = window.requestAnimationFrame(() => recalculate())
    return () => window.cancelAnimationFrame(frame)
  }, [recalculate, itemKey])

  React.useEffect(() => {
    const container = containerRef.current
    if (!container || typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(() => {
      window.requestAnimationFrame(() => recalculate())
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [containerRef, recalculate])

  return { visibleCount, measureRef }
}
