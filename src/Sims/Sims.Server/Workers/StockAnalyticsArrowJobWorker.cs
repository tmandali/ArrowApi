using System.Data;
using System.Data.Common;
using System.Runtime.CompilerServices;
using Apache.Arrow;
using Arrow.Data;
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

        using DataTable table = _service.BuildArrowTable(request);

        // Küçük batch → daha fazla progress SSE event'i
        int batchSize = request.BatchSize is > 0 ? request.BatchSize.Value : 12;
        var options = new ArrowConversionOptions { BatchSize = batchSize };

        await _context.PublishInfoAsync(
            $"Streaming Arrow batches (batchSize={batchSize}, rows={table.Rows.Count})",
            cancellationToken);
        await Task.Delay(TimeSpan.FromMilliseconds(500), cancellationToken);

        await using DbDataReader dbReader = table.CreateDataReader();
        await using ArrowBatchReader arrowReader = dbReader.OpenArrowReader(options);

        await foreach (RecordBatch batch in arrowReader.ReadBatchesAsync(cancellationToken))
        {
            await Task.Delay(BatchDelay, cancellationToken);
            yield return batch;
        }

        await Task.Delay(TimeSpan.FromMilliseconds(400), cancellationToken);
        await _context.PublishInfoAsync(
            $"Report ready ({table.Rows.Count} accounts, {table.Columns.Count} columns)",
            cancellationToken);
    }
}
