import * as React from "react"

/**
 * Sabit satır yüksekliğine sahip listeler için sanal pencere.
 * Yalnızca görünür pencereyi (overscan dahil) render eder; kaydırma yüksekliği
 * üst/alt boşlukla (spacer) korunur. DOM sayısı satır sayısından bağımsız kalır.
 */
export function useVirtualWindow<T>(
  items: readonly T[],
  rowHeight: number,
  overscan = 6
) {
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = React.useState(0)
  const [viewportHeight, setViewportHeight] = React.useState(600)

  React.useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const update = () => {
      if (el.clientHeight > 0) {
        setViewportHeight((prev) => (prev !== el.clientHeight ? el.clientHeight : prev))
      }
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const reset = React.useCallback(() => {
    setScrollTop(0)
    if (scrollRef.current) scrollRef.current.scrollTop = 0
  }, [])

  const totalRows = items.length
  const totalHeight = totalRows * rowHeight

  React.useEffect(() => {
    const resetToTop = () => {
      setScrollTop(0)
      if (scrollRef.current) scrollRef.current.scrollTop = 0
    }
    if (scrollTop > 0 && totalHeight >= 0 && scrollTop >= totalHeight) {
      resetToTop()
    }
  }, [totalHeight, scrollTop])
  const effectiveViewportHeight = viewportHeight > 0 ? viewportHeight : 600
  const viewportRows = Math.ceil(effectiveViewportHeight / rowHeight)
  const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan)
  const endIndex = Math.min(
    totalRows,
    Math.ceil((scrollTop + effectiveViewportHeight) / rowHeight) + overscan
  )

  const onScroll = React.useCallback((event: React.UIEvent<HTMLDivElement>) => {
    const newTop = event.currentTarget.scrollTop
    setScrollTop((prev) => (prev !== newTop ? newTop : prev))
  }, [])

  return {
    scrollRef,
    onScroll,
    reset,
    totalHeight,
    viewportRows,
    startIndex,
    endIndex,
    visible: items.slice(startIndex, endIndex),
  }
}
