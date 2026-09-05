"use client";

import * as React from "react"
import type {
  GroupImperativeHandle,
  Layout,
  LayoutChangedMeta,
} from "react-resizable-panels"

/**
 * Panel layout persistence removed per user request:
 * Panels always open with clean, predictable declarative default sizes.
 */
export function usePersistedPanelLayout(_id?: string): {
  groupRef: React.RefObject<GroupImperativeHandle | null>
  onLayoutChanged: (layout: Layout, meta: LayoutChangedMeta) => void
} {
  const groupRef = React.useRef<GroupImperativeHandle | null>(null)
  const onLayoutChanged = React.useCallback(
    (_layout: Layout, _meta: LayoutChangedMeta) => {},
    []
  )
  return { groupRef, onLayoutChanged }
}

// Eski oturumlardan kalan panel layout kayıtlarını temizle
if (typeof window !== "undefined") {
  try {
    for (let i = window.localStorage.length - 1; i >= 0; i--) {
      const key = window.localStorage.key(i)
      if (key?.startsWith("yula:panel-layout:")) {
        window.localStorage.removeItem(key)
      }
    }
  } catch {
    // yoksay
  }
}
