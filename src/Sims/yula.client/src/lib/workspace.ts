export type WorkspaceKey =
  | "/selling"
  | "/stock"
  | "/accounting"
  | "/manufacturing"

export function workspaceKeyFromPath(pathname: string): WorkspaceKey {
  if (pathname.startsWith("/stock")) return "/stock"
  if (pathname.startsWith("/accounting")) return "/accounting"
  if (pathname.startsWith("/manufacturing")) return "/manufacturing"
  if (pathname.startsWith("/selling")) return "/selling"
  if (pathname === "/" || pathname === "") return "/selling"
  return "/selling"
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
      return "/selling"
    default:
      return "/selling"
  }
}
