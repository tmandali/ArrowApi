export type WorkspaceKey =
  | "/subcontracting"
  | "/selling"
  | "/stock"
  | "/accounting"
  | "/manufacturing"

export function workspaceKeyFromPath(pathname: string): WorkspaceKey {
  if (pathname.startsWith("/stock")) return "/stock"
  if (pathname.startsWith("/accounting")) return "/accounting"
  if (pathname.startsWith("/manufacturing")) return "/manufacturing"
  if (pathname.startsWith("/subcontracting") || pathname.startsWith("/selling")) return "/subcontracting"
  return "/subcontracting"
}

/** href veya type'tan workspace çıkar (eski persist kayıtları için). */
export function resolveNotificationWorkspace(input: {
  workspace?: string
  href?: string
  type?: string
}): WorkspaceKey {
  if (input.workspace) {
    return workspaceKeyFromPath(input.workspace)
  }
  if (input.href) {
    return workspaceKeyFromPath(input.href)
  }
  switch (input.type) {
    case "stock":
      return "/stock"
    case "report":
      return "/accounting"
    case "manufacturing":
      return "/manufacturing"
    case "order":
    case "subcontracting":
      return "/subcontracting"
    default:
      return "/subcontracting"
  }
}
