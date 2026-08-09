using System;
using System.Data;
using System.Data.Common;
using System.Diagnostics;
using System.Runtime.CompilerServices;
using System.Threading.Tasks;
using Apache.Arrow;
using Arrow.Data;
using Arrow.Jobs;
using Sims.Server.Models.StockBalance;
using Sims.Server.Services;

namespace Sims.Server.Workers;

/// <summary>
/// Stock Balance Arrow job — schema criteria body → SSE + Arrow IPC.
/// </summary>
public sealed class StockBalanceArrowJobWorker : IArrowJobWorker<StockBalanceRequest>
{
    /// <summary>Demo / queue UX: job roughly runs this long before Arrow stream.</summary>
    private static readonly TimeSpan TargetDuration = TimeSpan.FromMinutes(0.5);

    private const int ProgressTicks = 5;

    private readonly IStockBalanceService _service;
    private readonly IArrowJobExecutionContext _context;

    public StockBalanceArrowJobWorker(
        IStockBalanceService service,
        IArrowJobExecutionContext context)
    {
        _service = service;
        _context = context;
    }

    public async IAsyncEnumerable<RecordBatch> Handle(
        StockBalanceRequest request,
        [EnumeratorCancellation] CancellationToken cancellationToken)
    {
        var started = Stopwatch.StartNew();

        int criteriaCount = request.Criteria?.Count ?? 0;
        await _context.PublishInfoAsync(
            $"Preparing: received {criteriaCount} criteria field(s)",
            cancellationToken);

        await _context.PublishInfoAsync("Building stock balance rows", cancellationToken);

        using DataTable table = _service.BuildArrowTable(request);

        int batchSize = request.BatchSize is > 0 ? request.BatchSize.Value : 12;
        var options = new ArrowConversionOptions { BatchSize = batchSize };

        // Spread remaining time across progress ticks (~30 seconds total).
        TimeSpan remaining = TargetDuration - started.Elapsed;
        if (remaining > TimeSpan.Zero)
        {
            TimeSpan tick = remaining / ProgressTicks;
            for (int i = 1; i <= ProgressTicks; i++)
            {
                int pct = i * 100 / ProgressTicks;
                await _context.PublishInfoAsync(
                    $"Processing stock balance… {pct}%",
                    cancellationToken);
                await Task.Delay(tick, cancellationToken);
            }
        }

        await _context.PublishInfoAsync(
            $"Streaming Arrow batches (batchSize={batchSize}, rows={table.Rows.Count})",
            cancellationToken);

        await using DbDataReader dbReader = table.CreateDataReader();
        await using ArrowBatchReader arrowReader = dbReader.OpenArrowReader(options);

        await foreach (RecordBatch batch in arrowReader.ReadBatchesAsync(cancellationToken))
        {
            yield return batch;
        }

        await _context.PublishInfoAsync(
            $"Report ready ({table.Rows.Count} rows, {table.Columns.Count} columns)",
            cancellationToken);
    }
}
