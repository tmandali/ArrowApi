import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom"
import RootLayout from "@/layouts/RootLayout"
import HomePage from "@/pages/HomePage"
import LoginPage from "@/pages/LoginPage"
import DashboardPage from "@/pages/DashboardPage"
import AccountingPage from "@/pages/AccountingPage"
import StockPage from "@/pages/StockPage"
import ManufacturingPage from "@/pages/ManufacturingPage"
import LandedCostVoucherPage from "@/pages/LandedCostVoucherPage"
import UserSettingsPage from "@/pages/UserSettingsPage"
import EmptyPage from "@/pages/EmptyPage"

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<RootLayout />}>
          <Route index element={<HomePage />} />
          <Route path="selling" element={<Navigate to="/" replace />} />
          <Route path="login" element={<LoginPage />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="accounting" element={<AccountingPage />} />
          <Route path="stock" element={<StockPage />} />
          <Route path="manufacturing" element={<ManufacturingPage />} />
          <Route path="landed-cost-voucher" element={<LandedCostVoucherPage />} />
          <Route path="user-settings" element={<UserSettingsPage />} />
          <Route path="empty" element={<EmptyPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
