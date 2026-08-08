using System.Data;
using Sims.Server.Models.StockBalance;

namespace Sims.Server.Services;

public interface IStockBalanceService
{
    /// <summary>
    /// Criteria echo + örnek stok satırlarından Arrow IPC için <see cref="DataTable"/> üretir.
    /// </summary>
    DataTable BuildArrowTable(StockBalanceRequest request);
}
