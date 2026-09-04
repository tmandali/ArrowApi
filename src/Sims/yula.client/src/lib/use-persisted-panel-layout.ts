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
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : null
  } catch {
    return null
  }
}

/**
 * Panel grubunun resize düzenini localStorage'da kalıcı kılar.
 *
 * - Kayıt: yalnızca kullanıcının sürüklemeleri (`meta.isUserInteraction`)
 *   `onLayoutChanged` üzerinden yazılır; pencere boyutu değişimi ve
 *   programatik değişimler kaydı bozmaz.
 * - Geri yükleme: mount sonrası `groupRef.setLayout` ile imperatif uygulanır —
 *   ilk render her zaman `defaultSize` ile açıldığı için sunucu HTML'iyle
 *   birebir eşleşir (hydration uyarısı oluşmaz).
 * - Grup yeniden başlatıldığında (layout id değişimi / remount) kayıtlı düzen
 *   yeniden uygulanır.
 */
export function usePersistedPanelLayout(id: string): {
  groupRef: React.RefObject<GroupImperativeHandle | null>
  onLayoutChanged: (layout: Layout, meta: LayoutChangedMeta) => void
} {
  const groupRef = React.useRef<GroupImperativeHandle | null>(null)

  React.useEffect(() => {
    const handle = groupRef.current
    const stored = readStoredLayout(id)
    if (!handle || !stored) return
    try {
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
