import { useParams } from "react-router-dom"
import { StockBalanceForm, StockBalanceJobView } from "@/features/stock/item"

export default function StockBalancePage() {
  const { jobId } = useParams<{ jobId?: string }>()
  if (jobId) {
    return <StockBalanceJobView jobId={jobId} />
  }
  return <StockBalanceForm />
}
