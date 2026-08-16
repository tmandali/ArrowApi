using System.Runtime.CompilerServices;
using System.Threading.Tasks;
using Apache.Arrow;
using Arrow.Jobs;
using Sims.Server.Models.StockBalance;
using Sims.Server.Services;

namespace Sims.Server.Workers;

/// <summary>
/// Stock Balance Arrow job — schema criteria body → SSE + Arrow IPC.
/// İlerleme gerçek satır sayısına bağlıdır (yapay zaman-yüzdesi yok);
/// per-batch progress event'leri satır sayısını gösterir.
/// </summary>
public sealed class StockBalanceArrowJobWorker : IArrowJobWorker<StockBalanceRequest>
{
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
        int criteriaCount = request.Criteria?.Count ?? 0;
        await _context.PublishInfoAsync(
            $"Preparing: received {criteriaCount} criteria field(s)",
            cancellationToken);

        await _context.PublishInfoAsync("Building stock balance rows", cancellationToken);

        // Küçük raporlarda 12 (demo progress), büyük raporlarda 10k (SSE/batch flood'u önler).
        int batchSize = request.BatchSize is > 0
            ? request.BatchSize.Value
            : (request.SampleRows ?? StockBalanceService.DefaultSampleRows) > 10_000
                ? 10_000
                : 12;

        await _context.PublishInfoAsync(
            $"Streaming Arrow batches (batchSize={batchSize})",
            cancellationToken);

        long totalRows = 0;
        int columnCount = 0;

        await foreach (RecordBatch batch in _service.StreamBatchesAsync(request, batchSize, cancellationToken))
        {
            totalRows += batch.Length;
            columnCount = batch.Schema.FieldsList.Count;
            try
            {
                yield return batch;
            }
            finally
            {
                batch.Dispose();
            }
        }

        await _context.PublishInfoAsync(
            $"Report ready ({totalRows} rows, {columnCount} columns)",
            cancellationToken);
    }
}
