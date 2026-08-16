using Apache.Arrow;
using Sims.Server.Models.StockAnalytics;

namespace Sims.Server.Services;

public interface IStockAnalyticsService
{
    /// <summary>
    /// Filtreye göre örnek ledger ağacını lazy olarak düzleştirip Arrow <see cref="RecordBatch"/>
    /// akışı olarak üretir (DataTable/List yok). Her batch <paramref name="batchSize"/> satırla sınırlıdır.
    /// Kolon seti <see cref="StockAnalyticsRequest.ValuesMode"/> ile dinamiktir.
    /// </summary>
    IAsyncEnumerable<RecordBatch> StreamBatchesAsync(
        StockAnalyticsRequest request,
        int batchSize,
        CancellationToken cancellationToken = default);
}
