"use client";

import * as React from "react"
import type {
  GroupImperativeHandle,
  Layout,
  LayoutChangedMeta,
} from "react-resizable-panels"

const STORAGE_PREFIX = "yula:panel-layout:"

function readStoredLayout(id: string): Layout | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + id)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Layout
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null
    }
    // Sıfır veya geçersiz panel oranlarını filtrele
    for (const key of Object.keys(parsed)) {
      const val = parsed[key]
      if (typeof val !== "number" || val <= 0 || Number.isNaN(val)) {
        return null
      }
    }
    return parsed
  } catch {
    return null
  }
}

const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? React.useLayoutEffect : React.useEffect

/**
 * Panel grubunun resize düzenini localStorage'da kalıcı kılar.
 *
 * - Kayıt: yalnızca kullanıcının sürüklemeleri (`meta.isUserInteraction`)
 *   `onLayoutChanged` üzerinden yazılır; pencere boyutu değişimi ve
 *   programatik değişimler kaydı bozmaz.
 * - Geri yükleme: mount anında `useIsomorphicLayoutEffect` ile tarayıcı ilk
 *   boyamayı (paint) yapmadan önce uygulanır — bu sayede sayfa yenilendiğinde
 *   (Ctrl+F5) panel boyutlarında sıçrama / titreme (layout shift) yaşanmaz.
 * - Grup yeniden başlatıldığında (layout id değişimi / remount) kayıtlı düzen
 *   yeniden uygulanır.
 */
export function usePersistedPanelLayout(id: string): {
  groupRef: React.RefObject<GroupImperativeHandle | null>
  onLayoutChanged: (layout: Layout, meta: LayoutChangedMeta) => void
} {
  const groupRef = React.useRef<GroupImperativeHandle | null>(null)

  useIsomorphicLayoutEffect(() => {
    const handle = groupRef.current
    const stored = readStoredLayout(id)
    if (!handle || !stored) return
    try {
      const current = handle.getLayout()
      const currentKeys = Object.keys(current)
      const storedKeys = Object.keys(stored)
      if (
        currentKeys.length === storedKeys.length &&
        currentKeys.every(
          (k) => Math.abs((current[k] ?? 0) - (stored[k] ?? 0)) < 0.5
        )
      ) {
        return
      }
      handle.setLayout(stored)
    } catch {
      // Geçersiz/eski kayıt — varsayılan düzen kalır.
    }
  }, [id])

  const onLayoutChanged = React.useCallback(
    (layout: Layout, meta: LayoutChangedMeta) => {
      if (!meta.isUserInteraction || typeof window === "undefined") return
      try {
        window.localStorage.setItem(STORAGE_PREFIX + id, JSON.stringify(layout))
      } catch {
        // Storage dolu/kapalı — sessizce yoksay.
      }
    },
    [id]
  )

  return { groupRef, onLayoutChanged }
}
