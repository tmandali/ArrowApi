using System.Data;
using Sims.Server.Models.StockAnalytics;

namespace Sims.Server.Services;

/// <summary>
/// Stock Analytics — örnek hesap ağacını flat Arrow tablosuna dönüştürür.
/// ValuesMode şemadaki tutar kolonlarını belirler (grid frontend'de schema'dan dinamik kurulur).
/// </summary>
public sealed class StockAnalyticsService : IStockAnalyticsService
{
    public DataTable BuildArrowTable(StockAnalyticsRequest request)
    {
        ArgumentNullException.ThrowIfNull(request);

        var fromDate = request.FromDate ?? new DateOnly(2025, 4, 1);
        var toDate = request.ToDate ?? new DateOnly(2026, 3, 31);
        if (toDate < fromDate)
            throw new ArgumentException("ToDate, FromDate'den önce olamaz.");

        var rows = StockAnalyticsSampleData.Build();
        if (!request.ShowZeroValues)
            rows = FilterZeroRows(rows);
        if (!request.ShowGroupAccounts)
            rows = FlattenToLeaves(rows);

        var valuesMode = string.IsNullOrWhiteSpace(request.ValuesMode) ? "5-values" : request.ValuesMode;
        var moneyColumns = ResolveMoneyColumns(valuesMode);

        var table = CreateSchema(moneyColumns);
        AppendRows(table, rows, parentId: null, level: 0, moneyColumns);
        return table;
    }

    /// <summary>
    /// 5-values: OpeningDr, Debit, Credit, ClosingDr, ClosingCr
    /// all: OpeningDr, OpeningCr, Debit, Credit, ClosingDr, ClosingCr
    /// </summary>
    internal static IReadOnlyList<string> ResolveMoneyColumns(string valuesMode) =>
        string.Equals(valuesMode, "all", StringComparison.OrdinalIgnoreCase)
            ?
            [
                "OpeningDr",
                "OpeningCr",
                "Debit",
                "Credit",
                "ClosingDr",
                "ClosingCr",
            ]
            :
            [
                "OpeningDr",
                "Debit",
                "Credit",
                "ClosingDr",
                "ClosingCr",
            ];

    private static DataTable CreateSchema(IReadOnlyList<string> moneyColumns)
    {
        var table = new DataTable("StockAnalytics");
        table.Columns.Add("Id", typeof(string));
        table.Columns.Add("ParentId", typeof(string));
        table.Columns.Add("Name", typeof(string));
        table.Columns.Add("Level", typeof(int));
        table.Columns.Add("IsGroup", typeof(bool));
        // Float64: browser Arrow/JS Number ile scale kaybı olmadan okunur.
        // (DataTable decimal → Decimal128(38,10) ham mantissa JS'te yanlış görünür.)
        foreach (var col in moneyColumns)
            table.Columns.Add(col, typeof(double));
        return table;
    }

    private static void AppendRows(
        DataTable table,
        IReadOnlyList<StockAnalyticsRowDto> rows,
        string? parentId,
        int level,
        IReadOnlyList<string> moneyColumns)
    {
        foreach (var row in rows)
        {
            var dataRow = table.NewRow();
            dataRow["Id"] = row.Id;
            dataRow["ParentId"] = parentId is null ? DBNull.Value : parentId;
            dataRow["Name"] = row.Name;
            dataRow["Level"] = level;
            dataRow["IsGroup"] = row.Children is { Count: > 0 };

            foreach (var col in moneyColumns)
            {
                decimal amount = col switch
                {
                    "OpeningDr" => row.OpeningDr,
                    "OpeningCr" => row.OpeningCr,
                    "Debit" => row.Debit,
                    "Credit" => row.Credit,
                    "ClosingDr" => row.ClosingDr,
                    "ClosingCr" => row.ClosingCr,
                    _ => 0m,
                };
                dataRow[col] = (double)amount;
            }

            table.Rows.Add(dataRow);

            if (row.Children is { Count: > 0 })
                AppendRows(table, row.Children, row.Id, level + 1, moneyColumns);
        }
    }

    private static IReadOnlyList<StockAnalyticsRowDto> FilterZeroRows(
        IReadOnlyList<StockAnalyticsRowDto> rows)
    {
        var filtered = new List<StockAnalyticsRowDto>();
        foreach (var row in rows)
        {
            IReadOnlyList<StockAnalyticsRowDto>? children = row.Children is null
                ? null
                : FilterZeroRows(row.Children);

            var hasActivity =
                row.OpeningDr != 0 || row.OpeningCr != 0 ||
                row.Debit != 0 || row.Credit != 0 ||
                row.ClosingDr != 0 || row.ClosingCr != 0 ||
                children is { Count: > 0 };

            if (!hasActivity)
                continue;

            filtered.Add(row with { Children = children is { Count: > 0 } ? children : null });
        }

        return filtered;
    }

    private static IReadOnlyList<StockAnalyticsRowDto> FlattenToLeaves(
        IReadOnlyList<StockAnalyticsRowDto> rows)
    {
        var leaves = new List<StockAnalyticsRowDto>();
        void Walk(IReadOnlyList<StockAnalyticsRowDto> nodes)
        {
            foreach (var node in nodes)
            {
                if (node.Children is { Count: > 0 })
                    Walk(node.Children);
                else
                    leaves.Add(node with { Children = null });
            }
        }

        Walk(rows);
        return leaves;
    }
}

/// <summary>UI mock'u ile uyumlu örnek hesap ağacı.</summary>
file static class StockAnalyticsSampleData
{
    public static IReadOnlyList<StockAnalyticsRowDto> Build() =>
    [
        DebitGroup("1", "Application of Funds (Assets)", 12_000_000m,
        [
            DebitGroup("1-1", "Current Assets", 12_000_000m,
            [
                DebitGroup("1-1-1", "Stock Assets", 12_000_000m,
                [
                    DebitLeaf("1-1-1-1", "Stock In Hand", 8_500_000m),
                    DebitLeaf("1-1-1-2", "Work In Progress", 2_000_000m),
                    DebitLeaf("1-1-1-3", "Finished Goods", 1_500_000m),
                ]),
                DebitGroup("1-1-2", "Accounts Receivable", 4_500_000m,
                [
                    DebitLeaf("1-1-2-1", "Debtors", 4_000_000m),
                    DebitLeaf("1-1-2-2", "Debtors USD", 500_000m),
                ]),
                DebitGroup("1-1-3", "Bank Accounts", 3_250_000m,
                [
                    DebitLeaf("1-1-3-1", "HDFC - Current", 1_800_000m),
                    DebitLeaf("1-1-3-2", "SBI - Current", 1_050_000m),
                    DebitLeaf("1-1-3-3", "Petty Cash", 400_000m),
                ]),
                DebitLeaf("1-1-4", "Cash In Hand", 225_000m),
            ]),
            DebitGroup("1-2", "Fixed Assets", 7_500_000m,
            [
                DebitLeaf("1-2-1", "Buildings", 4_000_000m),
                DebitLeaf("1-2-2", "Plant and Machinery", 2_500_000m),
                DebitLeaf("1-2-3", "Furniture and Fixtures", 600_000m),
                DebitLeaf("1-2-4", "Vehicles", 400_000m),
            ]),
        ]),
        Row("2", "Source of Funds (Liabilities)",
            debit: 540_000m, credit: 24_540_000m, closingCr: 24_000_000m,
            children:
            [
                DebitLeaf("2-1", "Foreign Currency Translation Reserve", 2_500_000m),
                Row("2-2", "Current Liabilities",
                    debit: 540_000m, credit: 24_540_000m, closingCr: 24_000_000m,
                    children:
                    [
                        Row("2-2-1", "Accounts Payable",
                            credit: 24_540_000m, closingCr: 24_540_000m,
                            children:
                            [
                                Row("2-2-1-1", "Creditors", credit: 22_000_000m, closingCr: 22_000_000m),
                                Row("2-2-1-2", "Creditors EUR", credit: 2_540_000m, closingCr: 2_540_000m),
                            ]),
                        DebitGroup("2-2-2", "Duties and Taxes", 540_000m,
                        [
                            DebitLeaf("2-2-2-1", "ST 6%", 210_000m),
                            DebitLeaf("2-2-2-2", "GST Payable", 280_000m),
                            DebitLeaf("2-2-2-3", "TDS Payable", 50_000m),
                        ]),
                        DebitGroup("2-2-3", "Provisions", 875_000m,
                        [
                            DebitLeaf("2-2-3-1", "Provision for Expenses", 500_000m),
                            DebitLeaf("2-2-3-2", "Provision for Tax", 375_000m),
                        ]),
                    ]),
                DebitGroup("2-3", "Loans (Liability)", 5_000_000m,
                [
                    DebitLeaf("2-3-1", "Bank Overdraft", 1_500_000m),
                    DebitLeaf("2-3-2", "Secured Loans", 3_500_000m),
                ]),
            ]),
        DebitGroup("3", "Expenses", 9_500_000m,
        [
            DebitGroup("3-1", "Indirect Expenses", 5_500_000m,
            [
                DebitLeaf("3-1-1", "Salary and Wages", 2_800_000m),
                DebitLeaf("3-1-2", "Rent", 1_200_000m),
                DebitLeaf("3-1-3", "Utilities", 650_000m),
                DebitLeaf("3-1-4", "Office Supplies", 325_000m),
                DebitLeaf("3-1-5", "Travel and Conveyance", 525_000m),
            ]),
            DebitGroup("3-2", "Direct Expenses", 4_000_000m,
            [
                DebitLeaf("3-2-1", "Freight Inward", 800_000m),
                DebitLeaf("3-2-2", "Manufacturing Expenses", 2_200_000m),
                DebitLeaf("3-2-3", "Packing Expenses", 1_000_000m),
            ]),
        ]),
        Row("4", "Income", credit: 31_000_000m, closingCr: 31_000_000m,
            children:
            [
                Row("4-1", "Direct Income", credit: 28_000_000m, closingCr: 28_000_000m,
                    children:
                    [
                        Row("4-1-1", "Sales", credit: 25_000_000m, closingCr: 25_000_000m),
                        Row("4-1-2", "Service Income", credit: 3_000_000m, closingCr: 3_000_000m),
                    ]),
                Row("4-2", "Indirect Income", credit: 3_000_000m, closingCr: 3_000_000m,
                    children:
                    [
                        Row("4-2-1", "Interest Income", credit: 1_200_000m, closingCr: 1_200_000m),
                        Row("4-2-2", "Other Income", credit: 1_800_000m, closingCr: 1_800_000m),
                    ]),
            ]),
    ];

    private static StockAnalyticsRowDto DebitLeaf(string id, string name, decimal amount) =>
        Row(id, name, debit: amount, closingDr: amount);

    private static StockAnalyticsRowDto DebitGroup(
        string id,
        string name,
        decimal amount,
        IReadOnlyList<StockAnalyticsRowDto> children) =>
        Row(id, name, debit: amount, closingDr: amount, children: children);

    private static StockAnalyticsRowDto Row(
        string id,
        string name,
        decimal openingDr = 0m,
        decimal openingCr = 0m,
        decimal debit = 0m,
        decimal credit = 0m,
        decimal closingDr = 0m,
        decimal closingCr = 0m,
        IReadOnlyList<StockAnalyticsRowDto>? children = null) =>
        new()
        {
            Id = id,
            Name = name,
            OpeningDr = openingDr,
            OpeningCr = openingCr,
            Debit = debit,
            Credit = credit,
            ClosingDr = closingDr,
            ClosingCr = closingCr,
            Children = children,
        };
}

