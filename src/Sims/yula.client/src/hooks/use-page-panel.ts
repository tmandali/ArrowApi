import * as React from "react"

import { usePagePanelContext } from "@/context/page-panel-context"

type UsePagePanelOptions = {
  id: string
  title: string
  defaultOpen?: boolean
}

/**
 * Register the current page's toggleable panel (header button target) for the
 * mount lifetime and get its controlled open state.
 *
 * Hydration & SSR: The open state is synchronized from the root layout (via cookie),
 * meaning the server-rendered HTML and client hydration share the exact same state,
 * eliminating the flash of disappearing/appearing content on refresh.
 */
export function usePagePanel({
  id,
  title,
  defaultOpen = true,
}: UsePagePanelOptions) {
  const { register, unregister, setOpen, openById } = usePagePanelContext()
  const storedOpen = openById[id]

  React.useEffect(() => {
    register({ id, title, defaultOpen })
    return () => unregister(id)
  }, [id, title, defaultOpen, register, unregister])

  const open = storedOpen ?? defaultOpen

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
