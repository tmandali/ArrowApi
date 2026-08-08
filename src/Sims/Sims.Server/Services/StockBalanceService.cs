using System.Data;
using System.Text.Json;
using Sims.Server.Models.StockBalance;

namespace Sims.Server.Services;

/// <summary>
/// Stock Balance — criteria round-trip doğrulama + örnek satırlar (mock).
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
        table.Columns.Add("CriteriaKey", typeof(string));
        table.Columns.Add("CriteriaValue", typeof(string));

        int rowId = 1;
        if (request.Criteria is { Count: > 0 })
        {
            foreach (var (key, value) in request.Criteria)
            {
                table.Rows.Add(
                    $"c-{rowId}",
                    "",
                    "",
                    "",
                    0d,
                    key,
                    JsonElementToDisplay(value));
                rowId += 1;
            }
        }

        table.Rows.Add($"{rowId}", "SKU-100", "Sample Item A", "WH-01", 12.5d, "", "");
        table.Rows.Add($"{rowId + 1}", "SKU-200", "Sample Item B", "WH-02", 3d, "", "");

        return table;
    }

    private static string JsonElementToDisplay(JsonElement element)
    {
        return element.ValueKind switch
        {
            JsonValueKind.String => element.GetString() ?? "",
            JsonValueKind.Number => element.GetRawText(),
            JsonValueKind.True => "true",
            JsonValueKind.False => "false",
            JsonValueKind.Null => "",
            JsonValueKind.Undefined => "",
            _ => element.GetRawText(),
        };
    }
}
