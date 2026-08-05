import * as React from "react"
import { StockAnalyticsForm } from "@/features/stock/item"
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
    <StockAnalyticsForm
      filtersOpen={filtersOpen}
      onFiltersOpenChange={setFiltersOpen}
    />
  )
}
