export function slugifyModule(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

export function unslugifyModule(slug: string) {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

/** Workspace module URL: /{workspace}/{slug} (report Criteria/Executions shell) */
export function emptyModulePath(workspace: string, title: string) {
  return `/${slugifyModule(workspace)}/${slugifyModule(title)}`
}

export const emptyWorkspaceHome: Record<string, { label: string; url: string }> =
  {
    system: { label: "System", url: "/" },
    stock: { label: "Stock", url: "/stock" },
    subcontracting: { label: "Subcontracting", url: "/subcontracting" },
    selling: { label: "Subcontracting", url: "/subcontracting" },
    accounting: { label: "Accounting", url: "/accounting" },
    manufacturing: { label: "Manufacturing", url: "/manufacturing" },
  }

/** Human-readable workspace label for a pathname (empty-page header/Yula intro). */
export function workspaceLabelFromPath(pathname: string): string {
  if (
    pathname === "/" ||
    pathname.startsWith("/my") ||
    pathname.startsWith("/system") ||
    pathname.startsWith("/user-settings")
  ) {
    return "System"
  }
  if (pathname.startsWith("/stock")) return "Stock"
  if (pathname.startsWith("/subcontracting") || pathname.startsWith("/selling")) return "Subcontracting"
  if (pathname.startsWith("/accounting") || pathname.startsWith("/financial-reports")) return "Accounting"
  if (pathname.startsWith("/manufacturing")) return "Manufacturing"
  return "System"
}

/** Workspace ID slug for a pathname. */
export function workspaceIdFromPath(pathname: string): string {
  if (
    pathname === "/" ||
    pathname.startsWith("/my") ||
    pathname.startsWith("/system") ||
    pathname.startsWith("/user-settings")
  ) {
    return "system"
  }
  if (pathname.startsWith("/stock")) return "stock"
  if (pathname.startsWith("/subcontracting")) return "subcontracting"
  if (pathname.startsWith("/selling")) return "subcontracting"
  if (pathname.startsWith("/accounting")) return "accounting"
  if (pathname.startsWith("/manufacturing")) return "manufacturing"
  return "system"
}

/** True for the main home page (/) where Yula runs in full-screen main mode. */
export function isWorkspaceHomePath(pathname: string): boolean {
  return pathname === "/"
}

/** Check if a conversation's pathname matches the active screen/page. */
export function isConversationOnScreen(
  cPath?: string,
  currentPath?: string
): boolean {
  if (!cPath || !currentPath) return false
  const c = cPath.split("?")[0].replace(/\/+$/, "")
  const curr = currentPath.split("?")[0].replace(/\/+$/, "")
  if (c === curr) return true

  // Both are landing/home paths
  if (isWorkspaceHomePath(c || "/") && isWorkspaceHomePath(curr || "/")) {
    return true
  }

  const getBaseRoute = (path: string) => {
    const parts = path.split("/").filter(Boolean)
    if (parts.length >= 2) {
      return `/${parts[0]}/${parts[1]}`
    }
    return `/${parts[0] || ""}`
  }

  const cBase = getBaseRoute(c)
  const currBase = getBaseRoute(curr)

  return cBase !== "/" && !isWorkspaceHomePath(c) && cBase === currBase
}

export function formatPathnameLabel(pathname?: string): string | null {
  if (!pathname || pathname === "/") return null
  if (pathname.includes("/stock/stock-balance")) return "Stok Bakiye"
  if (pathname.includes("/stock/stock-analytics")) return "Stok Analiz"
  if (pathname.includes("/stock/stock-ledger")) return "Stok Ekstre"
  if (pathname.includes("/stock/item")) return "Stok Kartı"
  if (pathname.includes("/system/users")) return "Kullanıcılar"
  const parts = pathname.split("/").filter(Boolean)
  if (parts.length === 0) return null
  const last = parts[parts.length - 1]
  if (last.length > 20) return parts[parts.length - 2] || parts[0]
  return last
}

