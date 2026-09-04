import * as React from "react"

import { usePagePanelStore } from "@/lib/stores/page-panel"
import { useMounted } from "@/hooks/use-mounted"

type UsePagePanelOptions = {
  id: string
  title: string
  defaultOpen?: boolean
}

/**
 * Register the current page's toggleable panel (header button target) for the
 * mount lifetime and get its controlled open state. Open flags persist per
 * panel id; registration itself is session-scoped (last mounted page wins).
 *
 * Hydration: the persisted open flag is applied only after mount — the
 * hydration render always uses defaultOpen so server/client markup matches.
 */
export function usePagePanel({
  id,
  title,
  defaultOpen = true,
}: UsePagePanelOptions) {
  const mounted = useMounted()
  const register = usePagePanelStore((s) => s.register)
  const unregister = usePagePanelStore((s) => s.unregister)
  const setOpen = usePagePanelStore((s) => s.setOpen)
  const storedOpen = usePagePanelStore((s) => s.openById[id])

  React.useEffect(() => {
    register({ id, title, defaultOpen })
    return () => unregister(id)
  }, [id, title, defaultOpen, register, unregister])

  const open = mounted ? (storedOpen ?? defaultOpen) : defaultOpen

  const setPanelOpen = React.useCallback(
    (next: boolean) => setOpen(id, next),
    [id, setOpen]
  )
  const toggle = React.useCallback(
    () => setOpen(id, !open),
    [id, open, setOpen]
  )

  return { open, setOpen: setPanelOpen, toggle }
}
