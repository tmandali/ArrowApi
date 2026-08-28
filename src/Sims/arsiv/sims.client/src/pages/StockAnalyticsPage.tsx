import { useParams } from "react-router-dom"
import { StockAnalyticsForm, StockAnalyticsJobView } from "@/features/stock/item"

export default function StockAnalyticsPage() {
  const { jobId } = useParams<{ jobId?: string }>()
  if (jobId) {
    return <StockAnalyticsJobView jobId={jobId} />
  }
  return <StockAnalyticsForm />
}
