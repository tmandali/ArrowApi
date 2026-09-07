import { redirect } from "next/navigation";

export default async function RetailSalesJobPage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const { jobId } = await params;
  redirect(`/stock/retail-sales-report?jobId=${encodeURIComponent(jobId)}`);
}
