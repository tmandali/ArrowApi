import * as React from "react"
import { StockAnalyticsForm } from "@/features/stock/item"

export default function StockAnalyticsPage() {
  const [filtersOpen, setFiltersOpen] = React.useState(true)

  return (
    <StockAnalyticsForm
      filtersOpen={filtersOpen}
      onFiltersOpenChange={setFiltersOpen}
    />
  )
}
