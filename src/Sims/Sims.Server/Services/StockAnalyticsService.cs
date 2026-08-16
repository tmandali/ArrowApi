using Apache.Arrow;
using Apache.Arrow.Types;
using Arrow.Data;
using System.Runtime.CompilerServices;
using Sims.Server.Models.StockAnalytics;

namespace Sims.Server.Services;

/// <summary>
/// Stock Analytics — örnek hesap ağacını flat Arrow tablosuna dönüştürür.
/// Satırlar lazy üretilir (DataTable/List yok); her batch dolduğunda <see cref="RecordBatch"/> akar.
/// ValuesMode şemadaki tutar kolonlarını belirler (grid frontend'de schema'dan dinamik kurulur).
/// </summary>
public sealed class StockAnalyticsService : IStockAnalyticsService
{
    public async IAsyncEnumerable<RecordBatch> StreamBatchesAsync(
        StockAnalyticsRequest request,
        int batchSize,
        [EnumeratorCancellation] CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);

        var fromDate = request.FromDate ?? new DateOnly(2025, 4, 1);
        var toDate = request.ToDate ?? new DateOnly(2026, 3, 31);
        if (toDate < fromDate)
            throw new ArgumentException("ToDate, FromDate'den önce olamaz.");

        if (batchSize <= 0)
            throw new ArgumentOutOfRangeException(nameof(batchSize));

        var valuesMode = string.IsNullOrWhiteSpace(request.ValuesMode) ? "5-values" : request.ValuesMode;
        var moneyColumns = ResolveMoneyColumns(valuesMode);

        Schema schema = CreateSchema(moneyColumns);

        if (request.SampleRows is > 0)
        {
            // Büyük mock: sıfır dizi tahsisi ile doğrudan typed Arrow builder'larına yazar (O(1) satır maliyeti).
            await foreach (RecordBatch batch in StreamLargeBatchesAsync(
                request.SampleRows.Value,
                schema,
                moneyColumns,
                request.ShowGroupAccounts,
                batchSize,
                cancellationToken))
            {
                yield return batch;
            }
            yield break;
        }

        IReadOnlyList<StockAnalyticsRowDto> rows = StockAnalyticsSampleData.Build();
        IReadOnlyDictionary<string, bool>? activity =
            request.ShowZeroValues ? null : BuildActivityMap(rows);
        IEnumerable<object?[]> rowSource = EnumerateRows(
            rows,
            moneyColumns,
            showZeroValues: request.ShowZeroValues,
            showGroupAccounts: request.ShowGroupAccounts,
            activity,
            parentId: null,
            level: 0);

        IArrowType[] types = schema.FieldsList.Select(static f => f.DataType).ToArray();
        var builders = CreateBuilders(types);
        int count = 0;
        bool anyBatch = false;

        foreach (object?[] row in rowSource)
        {
            cancellationToken.ThrowIfCancellationRequested();

            for (int c = 0; c < types.Length; c++)
                AppendValue(builders[c], types[c], row[c]);

            count++;
            if (count < batchSize)
                continue;

            yield return BuildBatch(schema, builders, count);
            anyBatch = true;
            builders = CreateBuilders(types);
            count = 0;
        }

        if (count > 0)
            yield return BuildBatch(schema, builders, count);
        else if (!anyBatch)
            yield return schema.EmptyBatch();
    }

    /// <summary>
    /// 5-values: OpeningDr, Debit, Credit, ClosingDr, ClosingCr
    /// all: OpeningDr, OpeningCr, Debit, Credit, ClosingDr, ClosingCr
    /// </summary>
    private static IReadOnlyList<string> ResolveMoneyColumns(string valuesMode) =>
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

    private static Schema CreateSchema(IReadOnlyList<string> moneyColumns)
    {
        var fields = new List<Field>
        {
            new("Id", StringType.Default, nullable: true),
            new("ParentId", StringType.Default, nullable: true),
            new("Name", StringType.Default, nullable: true),
            new("Level", Int32Type.Default, nullable: true),
            new("IsGroup", BooleanType.Default, nullable: true),
        };

        // Float64: browser Arrow/JS Number ile scale kaybı olmadan okunur.
        foreach (var col in moneyColumns)
            fields.Add(new Field(col, DoubleType.Default, nullable: true));

        return new Schema(fields, metadata: null);
    }

    /// <summary>Pre-order lazy walk — aktivite haritası ile zero/saklı satır filtreleme inline uygulanır.</summary>
    private static IEnumerable<object?[]> EnumerateRows(
        IReadOnlyList<StockAnalyticsRowDto> nodes,
        IReadOnlyList<string> moneyColumns,
        bool showZeroValues,
        bool showGroupAccounts,
        IReadOnlyDictionary<string, bool>? activity,
        string? parentId,
        int level)
    {
        foreach (var node in nodes)
        {
            bool isGroup = node.Children is { Count: > 0 };

            if (!showZeroValues && !activity![node.Id])
                continue;

            if (showGroupAccounts || !isGroup)
                yield return ToRow(node, isGroup, parentId, level, moneyColumns);

            if (isGroup)
            {
                foreach (object?[] child in EnumerateRows(
                    node.Children!,
                    moneyColumns,
                    showZeroValues,
                    showGroupAccounts,
                    activity,
                    node.Id,
                    level + 1))
                {
                    yield return child;
                }
            }
        }
    }

    /// <summary>
    /// Büyük mock: tek kök + N-1 yaprak, satırlar sıfır allocation ile doğrudan builder'lara yazılır.
    /// </summary>
    private static async IAsyncEnumerable<RecordBatch> StreamLargeBatchesAsync(
        int nodeCount,
        Schema schema,
        IReadOnlyList<string> moneyColumns,
        bool showGroupAccounts,
        int batchSize,
        [EnumeratorCancellation] CancellationToken cancellationToken)
    {
        var idBuilder = new StringArray.Builder();
        var parentIdBuilder = new StringArray.Builder();
        var nameBuilder = new StringArray.Builder();
        var levelBuilder = new Int32Array.Builder();
        var isGroupBuilder = new BooleanArray.Builder();
        var moneyBuilders = new DoubleArray.Builder[moneyColumns.Count];
        for (int m = 0; m < moneyBuilders.Length; m++)
            moneyBuilders[m] = new DoubleArray.Builder();

        int count = 0;
        bool anyBatch = false;

        void AppendRoot()
        {
            idBuilder.Append("1");
            parentIdBuilder.AppendNull();
            nameBuilder.Append("Root Group");
            levelBuilder.Append(0);
            isGroupBuilder.Append(true);
            for (int m = 0; m < moneyBuilders.Length; m++)
                moneyBuilders[m].Append(0d);
            count++;
        }

        void AppendLeaf(int i)
        {
            double amount = (double)(i % 100_000m + 1m);
            idBuilder.Append($"1-{i}");
            parentIdBuilder.Append("1");
            nameBuilder.Append($"Leaf Account {i}");
            levelBuilder.Append(1);
            isGroupBuilder.Append(false);
            for (int m = 0; m < moneyColumns.Count; m++)
            {
                double val = moneyColumns[m] is "Debit" or "ClosingDr" ? amount : 0d;
                moneyBuilders[m].Append(val);
            }
            count++;
        }

        RecordBatch FlushBatch()
        {
            var arrays = new IArrowArray[5 + moneyBuilders.Length];
            arrays[0] = idBuilder.Build();
            arrays[1] = parentIdBuilder.Build();
            arrays[2] = nameBuilder.Build();
            arrays[3] = levelBuilder.Build();
            arrays[4] = isGroupBuilder.Build();
            for (int m = 0; m < moneyBuilders.Length; m++)
                arrays[5 + m] = moneyBuilders[m].Build();

            idBuilder = new StringArray.Builder();
            parentIdBuilder = new StringArray.Builder();
            nameBuilder = new StringArray.Builder();
            levelBuilder = new Int32Array.Builder();
            isGroupBuilder = new BooleanArray.Builder();
            for (int m = 0; m < moneyBuilders.Length; m++)
                moneyBuilders[m] = new DoubleArray.Builder();

            var batch = new RecordBatch(schema, arrays, count);
            count = 0;
            return batch;
        }

        if (showGroupAccounts)
        {
            AppendRoot();
            if (count >= batchSize)
            {
                yield return FlushBatch();
                anyBatch = true;
            }
        }

        for (int i = 1; i < nodeCount; i++)
        {
            cancellationToken.ThrowIfCancellationRequested();
            AppendLeaf(i);
            if (count >= batchSize)
            {
                yield return FlushBatch();
                anyBatch = true;
            }
        }

        if (count > 0)
        {
            yield return FlushBatch();
        }
        else if (!anyBatch)
        {
            yield return schema.EmptyBatch();
        }
    }

    /// <summary>
    /// Her düğüm için "kendisinde veya alt ağacında aktivite var mı?" bayrağını tek post-order
    /// geçişle hesaplar (flat liste yok).
    /// </summary>
    private static IReadOnlyDictionary<string, bool> BuildActivityMap(
        IReadOnlyList<StockAnalyticsRowDto> nodes)
    {
        var map = new Dictionary<string, bool>();

        void Walk(IReadOnlyList<StockAnalyticsRowDto> list)
        {
            foreach (var node in list)
            {
                bool active = HasOwnActivity(node);
                if (node.Children is { Count: > 0 })
                {
                    Walk(node.Children);
                    foreach (var child in node.Children)
                    {
                        if (map[child.Id])
                        {
                            active = true;
                            break;
                        }
                    }
                }

                map[node.Id] = active;
            }
        }

        Walk(nodes);
        return map;
    }

    private static bool HasOwnActivity(StockAnalyticsRowDto row) =>
        row.OpeningDr != 0 || row.OpeningCr != 0 ||
        row.Debit != 0 || row.Credit != 0 ||
        row.ClosingDr != 0 || row.ClosingCr != 0;

    private static object?[] ToRow(
        StockAnalyticsRowDto row,
        bool isGroup,
        string? parentId,
        int level,
        IReadOnlyList<string> moneyColumns)
    {
        var values = new object?[5 + moneyColumns.Count];
        values[0] = row.Id;
        values[1] = parentId is null ? DBNull.Value : parentId;
        values[2] = row.Name;
        values[3] = level;
        values[4] = isGroup;

        for (int i = 0; i < moneyColumns.Count; i++)
            values[5 + i] = GetMoneyValue(row, moneyColumns[i]);

        return values;
    }

    private static double GetMoneyValue(StockAnalyticsRowDto row, string column) =>
        column switch
        {
            "OpeningDr" => (double)row.OpeningDr,
            "OpeningCr" => (double)row.OpeningCr,
            "Debit" => (double)row.Debit,
            "Credit" => (double)row.Credit,
            "ClosingDr" => (double)row.ClosingDr,
            "ClosingCr" => (double)row.ClosingCr,
            _ => 0d,
        };

    private static object[] CreateBuilders(IArrowType[] types)
    {
        var builders = new object[types.Length];
        for (int i = 0; i < types.Length; i++)
        {
            builders[i] = types[i] switch
            {
                StringType => new StringArray.Builder(),
                Int32Type => new Int32Array.Builder(),
                BooleanType => new BooleanArray.Builder(),
                DoubleType => new DoubleArray.Builder(),
                _ => throw new NotSupportedException($"'{types[i].Name}' türü için builder desteklenmiyor."),
            };
        }

        return builders;
    }

    private static void AppendValue(object builder, IArrowType type, object? value)
    {
        if (value is null or DBNull)
        {
            switch (builder)
            {
                case StringArray.Builder b: b.AppendNull(); return;
                case Int32Array.Builder b: b.AppendNull(); return;
                case BooleanArray.Builder b: b.AppendNull(); return;
                case DoubleArray.Builder b: b.AppendNull(); return;
                default: break;
            }

            throw new NotSupportedException($"'{type.Name}' türü için null ekleme desteklenmiyor.");
        }

        switch (builder)
        {
            case StringArray.Builder b: b.Append((string)value); return;
            case Int32Array.Builder b: b.Append((int)value); return;
            case BooleanArray.Builder b: b.Append((bool)value); return;
            case DoubleArray.Builder b: b.Append((double)value); return;
            default: throw new NotSupportedException($"'{type.Name}' türü desteklenmiyor.");
        }
    }

    private static RecordBatch BuildBatch(Schema schema, object[] builders, int count)
    {
        var arrays = new IArrowArray[builders.Length];
        for (int i = 0; i < builders.Length; i++)
        {
            arrays[i] = builders[i] switch
            {
                StringArray.Builder b => b.Build(),
                Int32Array.Builder b => b.Build(),
                BooleanArray.Builder b => b.Build(),
                DoubleArray.Builder b => b.Build(),
                _ => throw new NotSupportedException($"'{schema.FieldsList[i].DataType.Name}' türü desteklenmiyor."),
            };
        }

        return new RecordBatch(schema, arrays, count);
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
