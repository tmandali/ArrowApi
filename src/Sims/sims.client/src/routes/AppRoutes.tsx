import { useEffect, useState } from "react"
import { Navigate, Route, Routes, useLocation, useParams } from "react-router-dom"
import { AppLayout } from "@/components/layout/app-layout"
import { RouteTopBar } from "@/components/layout/route-top-bar"
import { accountingRoutes } from "@/features/accounting"
import { landedCostRoutes } from "@/features/landed-cost"
import { manufacturingRoutes } from "@/features/manufacturing"
import { sellingRoutes } from "@/features/selling"
import { stockRoutes } from "@/features/stock"
import type { WorkspaceRouteConfig } from "@/lib/workspace-route"
import DashboardPage from "@/pages/DashboardPage"
import HomePage from "@/pages/HomePage"
import LoginPage from "@/pages/LoginPage"
import NotFoundPage from "@/pages/NotFoundPage"
import UserSettingsPage from "@/pages/UserSettingsPage"
import { AiAgentDemoPage } from "@/features/ai-agent/AiAgentDemoPage"

/** Workspace home landing screens — all render the shared HomePage. */
const workspaceHomePaths = ["", "/selling", "/accounting", "/stock", "/manufacturing"]

/** /empty/{workspace}/{slug} → /{workspace}/{slug} */
function LegacyEmptyPrefixRedirect() {
  const { workspace = "selling", slug = "module" } = useParams<{
    workspace: string
    slug: string
  }>()
  return <Navigate to={`/${workspace}/${slug}`} replace />
}

/** /{workspace}/empty/{slug} → /{workspace}/{slug} */
function LegacyWorkspaceEmptyRedirect() {
  const { workspace = "selling", slug = "module" } = useParams<{
    workspace: string
    slug: string
  }>()
  return <Navigate to={`/${workspace}/${slug}`} replace />
}

function renderRoutes(configs: WorkspaceRouteConfig[], fullHeight = false) {
  return configs
    .filter((config) => Boolean(config.fullHeight) === fullHeight)
    .map((config) => {
      const Page = config.Component
      return <Route key={config.path} path={config.path} element={<Page />} />
    })
}

export function AppRoutes() {
  // Route changes: slim top bar without unmounting the page.
  const [routePending, setRoutePending] = useState(false)
  const { pathname } = useLocation()

  useEffect(() => {
    setRoutePending(true)
    const timer = setTimeout(() => setRoutePending(false), 350)
    return () => clearTimeout(timer)
  }, [pathname])

  return (
    <>
      {routePending ? <RouteTopBar /> : null}
      <Routes>
        <Route path="login" element={<LoginPage />} />

        <Route element={<AppLayout />}>
          {workspaceHomePaths.map((path) => (
            <Route key={path} path={path} element={<HomePage />} />
          ))}
          <Route path="dashboard" element={<DashboardPage />} />
          {renderRoutes(sellingRoutes)}
          {renderRoutes(stockRoutes)}
          {renderRoutes(landedCostRoutes)}
          {renderRoutes(accountingRoutes)}
          {renderRoutes(manufacturingRoutes)}
          <Route path="user-settings" element={<UserSettingsPage />} />
          <Route path="ai-agent" element={<AiAgentDemoPage />} />
          <Route
            path="empty/:workspace/:slug"
            element={<LegacyEmptyPrefixRedirect />}
          />
          <Route
            path=":workspace/empty/:slug"
            element={<LegacyWorkspaceEmptyRedirect />}
          />
          <Route path="empty" element={<Navigate to="/" replace />} />
        </Route>

        <Route element={<AppLayout fullHeight />}>
          {renderRoutes(sellingRoutes, true)}
          {renderRoutes(stockRoutes, true)}
          {renderRoutes(landedCostRoutes, true)}
          {renderRoutes(accountingRoutes, true)}
          {renderRoutes(manufacturingRoutes, true)}
        </Route>

        <Route element={<AppLayout />}>
          <Route path="stock/*" element={<NotFoundPage />} />
          <Route path="accounting/*" element={<NotFoundPage />} />
          <Route path="manufacturing/*" element={<NotFoundPage />} />
          <Route path="selling/*" element={<NotFoundPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </>
  )
}
