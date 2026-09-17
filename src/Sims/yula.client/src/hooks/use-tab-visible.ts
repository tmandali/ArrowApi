import * as React from "react"

/**
 * `document.visibilityState` aboneliği. Mount'a kadar `true` döner (SSR-safe).
 *
 * Background polling döngülerini (job listesi, notification popover,
 * event-log fallback) sekme gizli iken durdurmak için kullanılır:
 * hidden'da fetch atılmaz; visible'a geçişte tüketici catch-up refresh yapar.
 */
export function useTabVisible() {
  const [visible, setVisible] = React.useState(true)

  React.useEffect(() => {
    const onChange = () => setVisible(document.visibilityState === "visible")
    onChange()
    document.addEventListener("visibilitychange", onChange)
    return () => document.removeEventListener("visibilitychange", onChange)
  }, [])

  return visible
}
