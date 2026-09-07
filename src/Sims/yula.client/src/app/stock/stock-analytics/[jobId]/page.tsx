import { redirect } from "next/navigation";

export default async function StockAnalyticsJobPage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const { jobId } = await params;
  redirect(`/stock/stock-analytics?jobId=${encodeURIComponent(jobId)}`);
}
