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

/** Workspace roots that render the same Yula home screen as "/" (workspace switcher only). */
const WORKSPACE_ROOT_PATHS = new Set([
  "/stock",
  "/subcontracting",
  "/selling",
  "/accounting",
  "/financial-reports",
  "/manufacturing",
])

/** True for the main home screen (/ and workspace roots) where Yula runs in full-screen main mode. */
export function isWorkspaceHomePath(pathname: string): boolean {
  return pathname === "/" || WORKSPACE_ROOT_PATHS.has(pathname)
}

/** Normalize path for conversation/screen matching (query düşer, trailing slash temizlenir). */
export function normalizePath(path: string): string {
  return path.split("?")[0].replace(/\/+$/, "") || "/"
}

/** Check if a conversation's pathname matches the active screen/page. */
export function isConversationOnScreen(
  cPath?: string,
  currentPath?: string
): boolean {
  if (!cPath || !currentPath) return false
  const c = normalizePath(cPath)
  const curr = normalizePath(currentPath)
  if (c === curr) return true

  const cExec = reportExecutionPath(cPath)
  const currExec = reportExecutionPath(currentPath)
  if (cExec && currExec && cExec === currExec) return true

  const cJob = extractJobIdFromHref(cPath)
  const currJob = extractJobIdFromHref(currentPath)
  if (cJob && currJob) {
    return cJob.toLowerCase() === currJob.toLowerCase()
  }

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

function reportScreenLabel(pathname: string): string | null {
  if (pathname.includes("/stock/stock-balance")) return "Stok Bakiye"
  if (pathname.includes("/stock/stock-analytics")) return "Stok Analiz"
  if (pathname.includes("/stock/retail-sales-report")) return "Perakende Satış"
  if (pathname.includes("/stock/stock-ledger")) return "Stok Ekstre"
  if (pathname.includes("/stock/item")) return "Stok Kartı"
  if (pathname.includes("/system/users")) return "Kullanıcılar"
  return null
}

export function formatPathnameLabel(pathname?: string): string | null {
  if (!pathname || isWorkspaceHomePath(pathname.split("?")[0] || "/")) return null
  const jobId = extractJobIdFromHref(pathname)
  const named = reportScreenLabel(pathname)
  if (named) {
    return jobId ? `${named} · ${jobId.slice(0, 8)}` : named
  }
  const parts = pathname.split("/").filter(Boolean)
  if (parts.length === 0) return null
  const last = parts[parts.length - 1]
  if (jobId) {
    const reportSeg = parts.length >= 2 ? parts[parts.length - 2] : parts[0]
    return `${reportSeg} · ${jobId.slice(0, 8)}`
  }
  if (last.length > 20) return parts[parts.length - 2] || parts[0]
  return last
}

/**
 * Sohbet kaydı: execution ekranı + job query (GUID sonuç path'i değil).
 * Job'lı sayfalar iki URL formunda açılabilir (GUID path / ?job= query);
 * kayıt kullanıcının gerçekte kaldığı formu KORUR, zorla ?job= biçimine çevirmez.
 */
export function resolveConversationPathname(
  existing?: string | null,
  current?: string | null,
): string | undefined {
  const keepForm = (href: string) => href.replace(/\/+$/, "") || "/"
  const job =
    extractJobIdFromHref(current) ?? extractJobIdFromHref(existing) ?? undefined
  const exec =
    reportExecutionPath(current) ?? reportExecutionPath(existing) ?? undefined
  if (job && exec) {
    // Gerçek sayfa formu korunur: current formu önce, sonra existing, en sonda GUID path üretilir
    if (current && extractJobIdFromPath(current)) return normalizePath(current)
    if (current && extractJobIdFromHref(current)) return keepForm(current)
    if (existing && extractJobIdFromPath(existing)) return normalizePath(existing)
    if (existing && extractJobIdFromHref(existing)) return keepForm(existing)
    return `${exec}/${job}`
  }
  return exec || (current ? normalizePath(current) : undefined) || (existing ? normalizePath(existing) : undefined)
}

export const GUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** True if the string is a valid 36-char GUID (jobId). */
export function isGuidString(value?: string | null): boolean {
  if (!value) return false
  return GUID_REGEX.test(value.trim())
}

/** Extracts the trailing jobId (GUID) from a pathname if present. */
export function extractJobIdFromPath(pathname?: string | null): string | null {
  if (!pathname) return null
  const clean = pathname.split("?")[0].replace(/\/+$/, "")
  const lastSeg = clean.split("/").pop() ?? ""
  return isGuidString(lastSeg) ? lastSeg : null
}

/** Path GUID veya `?job=` query. */
export function extractJobIdFromHref(href?: string | null): string | null {
  if (!href) return null
  const fromPath = extractJobIdFromPath(href)
  if (fromPath) return fromPath
  const q = href.split("?")[1]
  if (!q) return null
  const job = new URLSearchParams(q).get("job")
  return isGuidString(job) ? job!.trim() : null
}

/** `/stock/stock-balance/{guid}` → `/stock/stock-balance` (query yok). */
export function reportExecutionPath(href?: string | null): string | null {
  if (!href) return null
  const path = normalizePath(href)
  if (extractJobIdFromPath(path)) {
    const parts = path.split("/").filter(Boolean)
    parts.pop()
    return parts.length ? `/${parts.join("/")}` : "/"
  }
  return path
}

export function reportExecutionHref(pagePath: string, jobId: string): string {
  const base = reportExecutionPath(pagePath) ?? (pagePath.replace(/\/+$/, "") || "/")
  return `${base}?job=${encodeURIComponent(jobId)}`
}

/** `/stock/stock-balance` → `stock-balance` */
export function reportScopeFromPath(href?: string | null): string | null {
  const exec = reportExecutionPath(href)
  if (!exec) return null
  const parts = exec.split("/").filter(Boolean)
  return parts.length >= 2 ? parts[1] : null
}

/** True if the current URL path is a GUID-backed report result page (e.g. /<workspace>/<report>/<jobId>). */
export function isReportResultPath(pathname?: string | null): boolean {
  return extractJobIdFromPath(pathname) !== null
}

/**
 * Single source of truth for Result View Mode (GUID URL path or active DuckDB report grid).
 */
export function isReportResultView(
  pathname?: string | null,
  spec?: { tableName?: string; columns?: unknown[]; rowCount?: number | null } | null
): boolean {
  if (isReportResultPath(pathname)) return true
  if (!spec) return false
  return Boolean(
    (spec.tableName && spec.tableName.startsWith("report_")) ||
      spec.rowCount != null ||
      (spec.columns && spec.columns.length > 0)
  )
}

