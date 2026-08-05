import { lazy, Suspense } from "react"
import { Navigate, Route, Routes } from "react-router-dom"
import { Loader2 } from "lucide-react"
import { AppLayout } from "@/components/layout/app-layout"

const LoginPage = lazy(() => import("@/pages/LoginPage"))
const SellingPage = lazy(() => import("@/pages/SellingPage"))
const DashboardPage = lazy(() => import("@/pages/DashboardPage"))
const AccountingPage = lazy(() => import("@/pages/AccountingPage"))
const StockPage = lazy(() => import("@/pages/StockPage"))
const ItemPage = lazy(() => import("@/pages/ItemPage"))
const StockAnalyticsPage = lazy(() => import("@/pages/StockAnalyticsPage"))
const StockLedgerPage = lazy(() => import("@/pages/StockLedgerPage"))
const ManufacturingPage = lazy(() => import("@/pages/ManufacturingPage"))
const LandedCostVoucherPage = lazy(() => import("@/pages/LandedCostVoucherPage"))
const UserSettingsPage = lazy(() => import("@/pages/UserSettingsPage"))
const EmptyPage = lazy(() => import("@/pages/EmptyPage"))

function RouteFallback() {
  return (
    <div className="flex flex-1 items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
      <Loader2 className="size-4 animate-spin" />
      Yükleniyor…
    </div>
  )
}

export function AppRoutes() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="login" element={<LoginPage />} />

        <Route element={<AppLayout />}>
          <Route index element={<SellingPage />} />
          <Route path="selling" element={<Navigate to="/" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="accounting" element={<AccountingPage />} />
          <Route path="stock" element={<StockPage />} />
          <Route path="stock/item" element={<ItemPage />} />
          <Route path="products" element={<Navigate to="/stock/item" replace />} />
          <Route path="manufacturing" element={<ManufacturingPage />} />
          <Route path="landed-cost-voucher" element={<LandedCostVoucherPage />} />
          <Route path="user-settings" element={<UserSettingsPage />} />
          <Route path="empty/:workspace/:slug" element={<EmptyPage />} />
          <Route
            path="empty"
            element={<Navigate to="/empty/selling/module" replace />}
          />
        </Route>

        <Route element={<AppLayout fullHeight />}>
          <Route path="stock/stock-analytics" element={<StockAnalyticsPage />} />
          <Route path="stock/stock-ledger" element={<StockLedgerPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}
