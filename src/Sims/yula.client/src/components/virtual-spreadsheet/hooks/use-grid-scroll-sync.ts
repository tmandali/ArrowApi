"use client";

import * as React from "react"
import { useVirtualWindow } from "@/hooks/use-virtual-window"

export interface GridScrollSyncParams {
  displayItems: readonly unknown[]
  rowHeight: number
  resetKey?: unknown
  /** Başlığın yatay scroll'unu body ile senkronize eden ref */
  headerScrollRef: React.RefObject<HTMLDivElement | null>
  /** Aktif (ilk) sıralama kolonu değişince scroll sıfırlanır */
  activeSortColumn: string | null
  activeSortDirection: "asc" | "desc" | null
  /** Infinite scroll destekli mi */
  hasMore: boolean
  loadingMore: boolean
  onNeedMore?: () => void
}

export interface GridScrollSyncReturn {
  scrollRef: React.RefObject<HTMLDivElement | null>
  handleHeaderWheel: (event: React.WheelEvent<HTMLDivElement>) => void
  handleScroll: (event: React.UIEvent<HTMLDivElement>) => void
  /** Header sağ ucu ile body dikey scrollbar'ı hizalamak için scrollbar genişliği */
  scrollbarWidth: number
  /** Başlık en solda kaydırmış mı (son pinned kolonun gölgesi için) */
  isScrolledLeft: boolean
  startIndex: number
  endIndex: number
  windowRows: readonly unknown[]
  viewportRows: number | null
  reset: () => void
}

/**
 * Dikey sanal pencere + yatay header/body scroll senkronizasyonu + infinite
 * scroll tetiklemesini yönetir. `resetKey` değiştiğinde scroll 0'a sıfırlanır.
 */
export function useGridScrollSync({
  displayItems,
  rowHeight,
  resetKey,
  headerScrollRef,
  activeSortColumn,
  activeSortDirection,
  hasMore,
  loadingMore,
  onNeedMore,
}: GridScrollSyncParams): GridScrollSyncReturn {
  const {
    scrollRef,
    onScroll,
    reset,
    viewportRows,
    startIndex,
    endIndex,
    visible: windowRows,
  } = useVirtualWindow(displayItems as readonly Record<string, unknown>[], rowHeight)

  const [scrollbarWidth, setScrollbarWidth] = React.useState(0)
  const [isScrolledLeft, setIsScrolledLeft] = React.useState(false)
  const isScrolledLeftRef = React.useRef(false)

  React.useEffect(() => {
    reset()
    if (headerScrollRef.current) {
      headerScrollRef.current.scrollLeft = 0
    }
    isScrolledLeftRef.current = false
  }, [resetKey, reset, activeSortColumn, activeSortDirection, headerScrollRef])

  // Dikey scrollbar genişliğini ölç — başlığın sağ ucunu body scrollbar'ı ile tam hizalar
  React.useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const updateScrollbarWidth = () => {
      const sw = el.offsetWidth - el.clientWidth
      setScrollbarWidth((prev) => (prev !== sw ? sw : prev))
    }
    updateScrollbarWidth()
    const observer = new ResizeObserver(updateScrollbarWidth)
    observer.observe(el)
    return () => observer.disconnect()
  }, [scrollRef, displayItems.length])

  const onNeedMoreRef = React.useRef(onNeedMore)
  React.useEffect(() => {
    onNeedMoreRef.current = onNeedMore
  })

  const handleScroll = React.useCallback(
    (event: React.UIEvent<HTMLDivElement>) => {
      const el = event.currentTarget
      // Yatay kaydırmayı kolon başlıklarına senkronize et
      if (headerScrollRef.current && headerScrollRef.current.scrollLeft !== el.scrollLeft) {
        headerScrollRef.current.scrollLeft = el.scrollLeft
      }
      const scrolled = el.scrollLeft > 2
      if (scrolled !== isScrolledLeftRef.current) {
        isScrolledLeftRef.current = scrolled
        setIsScrolledLeft(scrolled)
      }
      const sw = el.offsetWidth - el.clientWidth
      if (sw !== scrollbarWidth) {
        setScrollbarWidth(sw)
      }
      onScroll(event)
      if (hasMore && !loadingMore) {
        const remaining = el.scrollHeight - (el.scrollTop + el.clientHeight)
        if (remaining < 300) {
          onNeedMoreRef.current?.()
        }
      }
    },
    [onScroll, hasMore, loadingMore, scrollbarWidth, headerScrollRef]
  )

  const handleHeaderWheel = React.useCallback(
    (event: React.WheelEvent<HTMLDivElement>) => {
      if (event.deltaX !== 0 && scrollRef.current) {
        scrollRef.current.scrollLeft += event.deltaX
      }
    },
    [scrollRef]
  )

  return {
    scrollRef,
    handleHeaderWheel,
    handleScroll,
    scrollbarWidth,
    isScrolledLeft,
    startIndex,
    endIndex,
    windowRows,
    viewportRows,
    reset,
  }
}
