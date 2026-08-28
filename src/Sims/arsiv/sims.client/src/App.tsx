import { BrowserRouter } from "react-router-dom"
import { AppProviders } from "@/context/AppProviders"
import { AppRoutes } from "@/routes/AppRoutes"

export default function App() {
  return (
    <BrowserRouter>
      <AppProviders>
        <AppRoutes />
      </AppProviders>
    </BrowserRouter>
  )
}
