import { ItemForm } from "./ItemForm"

export function StockAnalyticsForm() {
  return (
    <ItemForm
      mode="stock-analytics"
      tabs={["report", "tax"]}
      defaultTab="report"
      tabLabels={{
        tax: "Data Prepare",
        report: "Report",
      }}
    />
  )
}
