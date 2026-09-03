using Apache.Arrow;
using Arrow.Data;
using Arrow.Jobs;
using Dapper;
using Microsoft.Data.SqlClient;
using Sims.Server.Models.StockBalance;
using Sims.Server.Services;
using System.Runtime.CompilerServices;

namespace Sims.Server.Workers;

/// <summary>
/// Stock Balance Arrow job — schema criteria body → SSE + Arrow IPC.
/// İlerleme gerçek satır sayısına bağlıdır (yapay zaman-yüzdesi yok);
/// per-batch progress event'leri satır sayısını gösterir.
/// </summary>
public sealed class StockBalanceArrowJobWorker(
        IConfiguration configuration,
        IStockBalanceService service,
        IArrowJobExecutionContext context): IArrowJobWorker<StockBalanceRequest>
{   
    public async IAsyncEnumerable<RecordBatch> Handle(
        StockBalanceRequest request,
        [EnumeratorCancellation] CancellationToken cancellationToken)
    {
        //var cnnString = configuration.GetConnectionString("retail");
        //await using SqlConnection cnn = new(cnnString);
        //await cnn.OpenAsync(cancellationToken);

        //var command = new CommandDefinition(
        //    commandText: "SELECT Depo, SatisID, KasaTip, HareketBaslamaTarih, ToplamTutar, ToplamKdvTutar, GenelIskontoTutar, Islem, SonDuzenleme " +
        //                 "FROM tb_SatisBaslik (nolock) " +
        //                 "WHERE HareketBaslamaTarih >= @BasTarih AND HareketBaslamaTarih < @BitTarih",
        //    parameters: new {BasTarih=DateTime.Parse("2026-01-01"), BitTarih=DateTime.Parse("2026-02-01")},
        //    cancellationToken: cancellationToken
        //);

        //await using var reader = await cnn.ExecuteReaderAsync(command);
        //await using var arrowReader = reader.OpenArrowReader(new ArrowConversionOptions { BatchSize = 100_000 });

        //await foreach (RecordBatch batch in arrowReader.WithCancellation(cancellationToken))
        //{
        //    yield return batch;
        //}

        int criteriaCount = request.Criteria?.Count ?? 0;
        await context.PublishInfoAsync(
            $"Preparing: received {criteriaCount} criteria field(s)",
            cancellationToken);

        await context.PublishInfoAsync("Building stock balance rows", cancellationToken);

        // Küçük raporlarda 12 (demo progress), büyük raporlarda 10k (SSE/batch flood'u önler).
        int batchSize = request.BatchSize is > 0
            ? request.BatchSize.Value
            : (request.SampleRows ?? StockBalanceService.DefaultSampleRows) > 10_000
                ? 10_000
                : 12;

        await context.PublishInfoAsync(
            $"Streaming Arrow batches (batchSize={batchSize})",
            cancellationToken);

        long totalRows = 0;
        int columnCount = 0;

        await foreach (RecordBatch batch in service.StreamBatchesAsync(request, batchSize, cancellationToken))
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
    }
}
