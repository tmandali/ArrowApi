using Apache.Arrow;
using Apache.Arrow.Types;
using Arrow.Data;
using System.Runtime.CompilerServices;
using Sims.Server.Models.StockBalance;

namespace Sims.Server.Services;

/// <summary>
/// Stock Balance — örnek satırlar (mock). Satırlar lazy üretilir; DataTable/List yok,
/// her batch dolduğunda Arrow <see cref="RecordBatch"/> olarak akar.
/// </summary>
public sealed class StockBalanceService : IStockBalanceService
{
    /// <summary>SampleRows belirtilmezse üretilen varsayılan satır sayısı.</summary>
    public const int DefaultSampleRows = 100_000;

    private static readonly Field[] Fields =
    [
        new Field("Id", StringType.Default, nullable: true),
        new Field("ItemCode", StringType.Default, nullable: true),
        new Field("ItemName", StringType.Default, nullable: true),
        new Field("Warehouse", StringType.Default, nullable: true),
        new Field("Qty", DoubleType.Default, nullable: true),
        new Field("UnitPrice", DoubleType.Default, nullable: true),
        new Field("PostingDate", Date32Type.Default, nullable: true),
        new Field("IsActive", BooleanType.Default, nullable: true),
        new Field("BatchNumber", StringType.Default, nullable: true),
    ];

    public async IAsyncEnumerable<RecordBatch> StreamBatchesAsync(
        StockBalanceRequest request,
        int batchSize,
        [EnumeratorCancellation] CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);
        if (batchSize <= 0)
            throw new ArgumentOutOfRangeException(nameof(batchSize));

        var schema = new Schema(Fields, metadata: null);

        var id = new StringArray.Builder();
        var itemCode = new StringArray.Builder();
        var itemName = new StringArray.Builder();
        var warehouse = new StringArray.Builder();
        var qty = new DoubleArray.Builder();
        var unitPrice = new DoubleArray.Builder();
        var postingDate = new Date32Array.Builder();
        var isActive = new BooleanArray.Builder();
        var batchNumber = new StringArray.Builder();
        int count = 0;
        bool anyBatch = false;

        int sampleRows = request.SampleRows is > 0 ? request.SampleRows.Value : DefaultSampleRows;
        var baseDate = new DateTime(2026, 8, 16);

        for (int i = 1; i <= sampleRows; i++)
        {
            cancellationToken.ThrowIfCancellationRequested();

            id.Append(i.ToString());
            itemCode.Append($"SKU-{i % 1000:D3}");
            itemName.Append($"Sample Item {i % 250}");
            warehouse.Append($"WH-{i % 50:D2}");
            qty.Append(i % 1000 + 0.5d);
            unitPrice.Append(Math.Round(10.50d + (i % 500) * 1.25d, 2));
            postingDate.Append(baseDate.AddDays(-(i % 365)));
            isActive.Append(i % 3 != 0);

            if (i % 4 == 0)
                batchNumber.AppendNull();
            else
                batchNumber.Append($"BATCH-{(i % 80):D3}");

            count++;

            if (count < batchSize)
                continue;

            yield return BuildBatch(schema, count, id, itemCode, itemName, warehouse, qty, unitPrice, postingDate, isActive, batchNumber);
            anyBatch = true;

            id = new StringArray.Builder();
            itemCode = new StringArray.Builder();
            itemName = new StringArray.Builder();
            warehouse = new StringArray.Builder();
            qty = new DoubleArray.Builder();
            unitPrice = new DoubleArray.Builder();
            postingDate = new Date32Array.Builder();
            isActive = new BooleanArray.Builder();
            batchNumber = new StringArray.Builder();
            count = 0;
        }

        if (count > 0)
            yield return BuildBatch(schema, count, id, itemCode, itemName, warehouse, qty, unitPrice, postingDate, isActive, batchNumber);
        else if (!anyBatch)
            yield return schema.EmptyBatch();
    }

    private static RecordBatch BuildBatch(
        Schema schema,
        int count,
        StringArray.Builder id,
        StringArray.Builder itemCode,
        StringArray.Builder itemName,
        StringArray.Builder warehouse,
        DoubleArray.Builder qty,
        DoubleArray.Builder unitPrice,
        Date32Array.Builder postingDate,
        BooleanArray.Builder isActive,
        StringArray.Builder batchNumber) =>
        new(
            schema,
            [
                id.Build(),
                itemCode.Build(),
                itemName.Build(),
                warehouse.Build(),
                qty.Build(),
                unitPrice.Build(),
                postingDate.Build(),
                isActive.Build(),
                batchNumber.Build()
            ],
            count);
}
