using Apache.Arrow;
using Sims.Server.Models.StockBalance;

namespace Sims.Server.Services;

public interface IStockBalanceService
{
    /// <summary>
    /// Stock Balance satırlarını bellekte toplamadan (DataTable/List yok) Arrow <see cref="RecordBatch"/>
    /// akışı olarak üretir. Her batch <paramref name="batchSize"/> satırla sınırlıdır; bellek sabit kalır.
    /// </summary>
    IAsyncEnumerable<RecordBatch> StreamBatchesAsync(
        StockBalanceRequest request,
        int batchSize,
        CancellationToken cancellationToken = default);
}
