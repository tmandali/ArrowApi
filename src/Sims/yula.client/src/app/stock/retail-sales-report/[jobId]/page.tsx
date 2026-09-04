import { AppLayout } from "@/components/layout/app-layout";
import { RetailSalesJobView } from "@/features/stock/retail-sales-report";

export default async function RetailSalesJobPage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const { jobId } = await params;
  return (
    <AppLayout>
      <div className="flex h-full min-h-0 flex-1 flex-col">
        <RetailSalesJobView jobId={jobId} />
      </div>
    </AppLayout>
  );
}
