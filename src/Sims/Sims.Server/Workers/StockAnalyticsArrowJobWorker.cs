using System.Runtime.CompilerServices;
using System.Threading.Tasks;
using Apache.Arrow;
using Arrow.Jobs;
using Sims.Server.Models.StockAnalytics;
using Sims.Server.Services;

namespace Sims.Server.Workers;

/// <summary>
/// Stock Analytics Arrow job — SSE info/progress event'leri + Arrow IPC RecordBatch akışı.
/// Mock aşamalarda bilinçli beklemeler var; UI'dan event'leri takip etmek için.
/// </summary>
public sealed class StockAnalyticsArrowJobWorker : IArrowJobWorker<StockAnalyticsRequest>
{
    private static readonly TimeSpan StepDelay = TimeSpan.FromSeconds(1.2);
    private static readonly TimeSpan BatchDelay = TimeSpan.FromMilliseconds(700);

    private readonly IStockAnalyticsService _service;
    private readonly IArrowJobExecutionContext _context;

    public StockAnalyticsArrowJobWorker(
        IStockAnalyticsService service,
        IArrowJobExecutionContext context)
    {
        _service = service;
        _context = context;
    }

    public async IAsyncEnumerable<RecordBatch> Handle(
        StockAnalyticsRequest request,
        [EnumeratorCancellation] CancellationToken cancellationToken)
    {
        await _context.PublishInfoAsync("Preparing: validating filters", cancellationToken);
        await Task.Delay(StepDelay, cancellationToken);

        await _context.PublishInfoAsync("Fetching ledger balances", cancellationToken);
        await Task.Delay(StepDelay, cancellationToken);

        await _context.PublishInfoAsync("Building account tree", cancellationToken);
        await Task.Delay(StepDelay, cancellationToken);

        // Küçük raporlarda 12 (demo progress), büyük mock'ta 10k (SSE/batch flood'u önler).
        int batchSize = request.BatchSize is > 0
            ? request.BatchSize.Value
            : (request.SampleRows ?? 0) > 10_000 ? 10_000 : 12;

        await _context.PublishInfoAsync(
            $"Streaming Arrow batches (batchSize={batchSize})",
            cancellationToken);
        await Task.Delay(TimeSpan.FromMilliseconds(500), cancellationToken);

        long totalRows = 0;
        int columnCount = 0;

        await foreach (RecordBatch batch in _service.StreamBatchesAsync(request, batchSize, cancellationToken))
        {
            totalRows += batch.Length;
            columnCount = batch.Schema.FieldsList.Count;
            await Task.Delay(BatchDelay, cancellationToken);
            try
            {
                yield return batch;
            }
            finally
            {
                batch.Dispose();
            }
        }

        await Task.Delay(TimeSpan.FromMilliseconds(400), cancellationToken);
        await _context.PublishInfoAsync(
            $"Report ready ({totalRows} accounts, {columnCount} columns)",
            cancellationToken);
    }
}
