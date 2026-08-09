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
    selling: { label: "Subcontracting", url: "/selling" },
    accounting: { label: "Financial Reports", url: "/accounting" },
    stock: { label: "Stock", url: "/stock" },
    manufacturing: { label: "Manufacturing", url: "/manufacturing" },
  }

/** Human-readable workspace label for a pathname (empty-page header/Yula intro). */
export function workspaceLabelFromPath(pathname: string): string {
  if (pathname.startsWith("/selling")) return "Subcontracting"
  if (pathname.startsWith("/accounting")) return "Accounting"
  if (pathname.startsWith("/stock")) return "Stock"
  if (pathname.startsWith("/manufacturing")) return "Manufacturing"
  return "Home"
}

const workspaceHomePaths = ["/", "/selling", "/accounting", "/stock", "/manufacturing"]

/** True for the empty workspace landing pages where Yula auto-opens. */
export function isWorkspaceHomePath(pathname: string): boolean {
  return workspaceHomePaths.includes(pathname)
}
