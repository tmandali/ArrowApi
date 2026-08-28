import { Navigate, Outlet } from "react-router-dom"

type ProtectedRouteProps = {
  isAuthenticated?: boolean
  redirectTo?: string
}

/**
 * Wrap authenticated routes:
 * <Route element={<ProtectedRoute isAuthenticated={!!user} />}>...</Route>
 */
export function ProtectedRoute({
  isAuthenticated = true,
  redirectTo = "/login",
}: ProtectedRouteProps) {
  if (!isAuthenticated) {
    return <Navigate to={redirectTo} replace />
  }

  return <Outlet />
}
