import { redirect } from "next/navigation";

export default async function StockBalanceJobPage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const { jobId } = await params;
  redirect(`/stock/stock-balance?jobId=${encodeURIComponent(jobId)}`);
}
