"use client";

import * as React from "react"
import { useYulaGridStore } from "@/lib/stores/grid"

export interface MaximizedStateReturn {
  isMaximized: boolean
  handleToggleMaximize: () => void
}

export interface MaximizedStateParams {
  controlledMaximized?: boolean
  onToggleMaximize?: (maximized: boolean) => void
}

/**
 * Grid'in genişletilmiş / odak modu durumunu yönetir.
 * Kontrollü (`controlledMaximized !== undefined`) modda `onToggleMaximize`
 * callback'i, kontrolsüz modda ise global `useYulaGridStore` kullanılır.
 * Esc tuşu ile genişletilmiş moddan çıkış ve genişletilince sanal pencere
 * ölçümlerini tazeleme (resize event) de bu hook'un sorumluluğundadır.
 */
export function useMaximizedState({
  controlledMaximized,
  onToggleMaximize,
}: MaximizedStateParams): MaximizedStateReturn {
  const storeMaximized = useYulaGridStore((s) => s.isMaximized)
  const setStoreMaximized = useYulaGridStore((s) => s.setIsMaximized)

  const isMaximized = controlledMaximized !== undefined ? controlledMaximized : storeMaximized

  const handleToggleMaximize = React.useCallback(() => {
    const next = !isMaximized
    if (onToggleMaximize) {
      onToggleMaximize(next)
    } else {
      setStoreMaximized(next)
    }
  }, [isMaximized, onToggleMaximize, setStoreMaximized])

  // Esc tuşu ile genişletilmiş moddan çıkış
  React.useEffect(() => {
    if (!isMaximized) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault()
        if (onToggleMaximize) {
          onToggleMaximize(false)
        } else {
          setStoreMaximized(false)
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [isMaximized, onToggleMaximize, setStoreMaximized])

  // Genişletilmiş moda geçildiğinde sanal pencere ölçümlerini anında tazele
  React.useEffect(() => {
    if (!isMaximized) return
    const timer = setTimeout(() => {
      window.dispatchEvent(new Event("resize"))
    }, 50)
    return () => clearTimeout(timer)
  }, [isMaximized])

  return { isMaximized, handleToggleMaximize }
}
