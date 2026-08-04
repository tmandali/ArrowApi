import * as React from "react"
import { AppSidebar } from "@/components/layout/app-sidebar"
import { StockAnalyticsForm } from "@/features/stock/item"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { useStockAnalyticsReport } from "@/context/stock-analytics-report"

export default function StockAnalyticsPage() {
  const [filtersOpen, setFiltersOpen] = React.useState(true)
  const { isPendingView } = useStockAnalyticsReport()

  React.useEffect(() => {
    if (isPendingView) {
      setFiltersOpen(true)
    }
  }, [isPendingView])

  return (
    <SidebarProvider className="h-svh overflow-hidden">
      <AppSidebar />
      <SidebarInset className="min-h-0 overflow-hidden bg-background">
        <StockAnalyticsForm
          filtersOpen={filtersOpen}
          onFiltersOpenChange={setFiltersOpen}
        />
      </SidebarInset>
    </SidebarProvider>
  )
}
