import { Navigate, Route, Routes } from "react-router-dom"
import SellingPage from "@/pages/SellingPage"
import LoginPage from "@/pages/LoginPage"
import DashboardPage from "@/pages/DashboardPage"
import AccountingPage from "@/pages/AccountingPage"
import StockPage from "@/pages/StockPage"
import ManufacturingPage from "@/pages/ManufacturingPage"
import LandedCostVoucherPage from "@/pages/LandedCostVoucherPage"
import UserSettingsPage from "@/pages/UserSettingsPage"
import EmptyPage from "@/pages/EmptyPage"
import ItemPage from "@/pages/ItemPage"
import StockAnalyticsPage from "@/pages/StockAnalyticsPage"

export function AppRoutes() {
  return (
    <Routes>
      <Route index element={<SellingPage />} />
      <Route path="selling" element={<Navigate to="/" replace />} />
      <Route path="login" element={<LoginPage />} />
      <Route path="dashboard" element={<DashboardPage />} />
      <Route path="accounting" element={<AccountingPage />} />
      <Route path="stock" element={<StockPage />} />
      <Route path="stock/item" element={<ItemPage />} />
      <Route path="stock/stock-analytics" element={<StockAnalyticsPage />} />
      <Route path="products" element={<Navigate to="/stock/item" replace />} />
      <Route path="manufacturing" element={<ManufacturingPage />} />
      <Route path="landed-cost-voucher" element={<LandedCostVoucherPage />} />
      <Route path="user-settings" element={<UserSettingsPage />} />
      <Route path="empty" element={<EmptyPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
