using System.Data;
using Sims.Server.Models.StockAnalytics;

namespace Sims.Server.Services;

public interface IStockAnalyticsService
{
    /// <summary>
    /// Filtreye göre örnek ledger ağacını düzleştirip Arrow IPC için <see cref="DataTable"/> üretir.
    /// Kolon seti <see cref="StockAnalyticsRequest.ValuesMode"/> ile dinamiktir.
    /// </summary>
    DataTable BuildArrowTable(StockAnalyticsRequest request);
}
