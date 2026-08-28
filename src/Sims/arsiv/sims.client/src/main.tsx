import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import "@/styles/globals.css"
import App from "./App"
import { initAutoReportRegistry } from "@/lib/auto-report-registry"

// Otomatik Rapor Keşfi (JSON Schema -> Yula Cards)
initAutoReportRegistry()

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
