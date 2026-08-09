using System.Data;
using System.Text.Json;
using Sims.Server.Models.StockBalance;

namespace Sims.Server.Services;

/// <summary>
/// Stock Balance — örnek satırlar (mock).
/// </summary>
public sealed class StockBalanceService : IStockBalanceService
{
    public DataTable BuildArrowTable(StockBalanceRequest request)
    {
        ArgumentNullException.ThrowIfNull(request);

        var table = new DataTable("StockBalance");
        table.Columns.Add("Id", typeof(string));
        table.Columns.Add("ItemCode", typeof(string));
        table.Columns.Add("ItemName", typeof(string));
        table.Columns.Add("Warehouse", typeof(string));
        table.Columns.Add("Qty", typeof(double));

        table.Rows.Add("1", "SKU-100", "Sample Item A", "WH-01", 12.5d);
        table.Rows.Add("2", "SKU-200", "Sample Item B", "WH-02", 3d);

        return table;
    }
}
