import { AppLayout } from "@/components/layout/app-layout";
import { StockAnalyticsJobView } from "@/features/stock/item";

export default async function StockAnalyticsJobPage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const { jobId } = await params;
  return (
    <AppLayout>
      <div className="flex h-full min-h-0 flex-1 flex-col">
        <StockAnalyticsJobView jobId={jobId} />
      </div>
    </AppLayout>
  );
}
