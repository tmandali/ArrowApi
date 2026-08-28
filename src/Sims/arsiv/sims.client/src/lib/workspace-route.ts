import type { ComponentType } from "react"

/** Route contributed by a workspace feature. Rendered inside the app shell. */
export type WorkspaceRouteConfig = {
  /** React Router path (relative to root, e.g. "stock/item"). */
  path: string
  /** Page component (route wrapper from `pages/`). Eager import — no Suspense. */
  Component: ComponentType
  /** Render inside the full-height shell variant (reports / job views). */
  fullHeight?: boolean
}
