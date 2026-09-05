export type WorkspaceKey =
  | "/subcontracting"
  | "/selling"
  | "/stock"
  | "/accounting"
  | "/manufacturing";

export function workspaceKeyFromPath(pathname: string): WorkspaceKey {
  if (pathname.startsWith("/stock")) return "/stock";
  if (pathname.startsWith("/accounting")) return "/accounting";
  if (pathname.startsWith("/manufacturing")) return "/manufacturing";
  if (pathname.startsWith("/selling")) return "/selling";
  if (pathname.startsWith("/subcontracting")) return "/subcontracting";
  return "/stock";
}

/** href veya type'tan workspace çıkar (eski persist kayıtları için). */
export function resolveNotificationWorkspace(input: {
  workspace?: string;
  href?: string;
  type?: string;
}): WorkspaceKey {
  if (input.workspace) {
    return workspaceKeyFromPath(input.workspace);
  }
  if (input.href) {
    return workspaceKeyFromPath(input.href);
  }
  switch (input.type) {
    case "stock":
      return "/stock";
    case "report":
    case "accounting":
      return "/accounting";
    case "manufacturing":
      return "/manufacturing";
    case "selling":
    case "order":
      return "/selling";
    case "subcontracting":
      return "/subcontracting";
    default:
      return "/stock";
  }
}
