import * as React from "react"

/** useSyncExternalStore abonelikleri için no-op abonelik. */
export function emptySubscribe(_callback: () => void) {
  return () => {}
}

/**
 * Hydration güvenli "mounted" bayrağı: sunucuda `false`, istemcide `true`.
 * `useState(false) + useEffect(() => setMounted(true))` kalıbının
 * lint-temiz ve re-render-safe karşılığı.
 */
export function useMounted() {
  return React.useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  )
}
