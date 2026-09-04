import { AppLayout } from "@/components/layout/app-layout";
import { StockBalanceJobView } from "@/features/stock/stock-balance";

export default async function StockBalanceJobPage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const { jobId } = await params;
  return (
    <AppLayout>
      <div className="flex h-full min-h-0 flex-1 flex-col">
        <StockBalanceJobView jobId={jobId} />
      </div>
    </AppLayout>
  );
}
