using Apache.Arrow;
using Apache.Arrow.Ipc;
using Apache.Arrow.Scalars.Variant;

namespace Arrow.Data.Tests;

public class VariantRoundTripTests
{
    private static VariantValue[] CreateSamplePayloads() =>
    [
        VariantValue.FromObject(new Dictionary<string, VariantValue>
        {
            ["user_id"] = VariantValue.FromInt64(42),
            ["action"] = VariantValue.FromString("login"),
        }),
        VariantValue.FromArray(VariantValue.FromString("a"), VariantValue.FromString("b")),
    ];

    private static async Task<byte[]> WriteBatchToArrowIpcAsync(RecordBatch batch)
    {
        using var stream = new MemoryStream();
        using (var writer = new ArrowStreamWriter(stream, batch.Schema, leaveOpen: true))
            await writer.WriteBatchesAsync([batch]);

        return stream.ToArray();
    }

    [Fact]
    public async Task ReadBatchesAsync_round_trips_variant_values()
    {
        using RecordBatch source = VariantBatches.CreateSingleColumn(CreateSamplePayloads(), "event_data");
        byte[] ipc = await WriteBatchToArrowIpcAsync(source);

        await using var stream = new MemoryStream(ipc);
        await using ArrowBatchReader reader = ArrowData.OpenArrowReader(stream);

        int batchCount = 0;
        await foreach (RecordBatch batch in reader.ReadBatchesAsync())
        {
            batchCount++;
            Assert.Equal(2, batch.Length);

            VariantArray eventData = VariantBatches.GetVariantColumn(batch, "event_data");
            Assert.False(eventData.IsShredded);

            VariantValue row0 = eventData.GetVariantValue(0);
            Assert.True(row0.IsObject);
            Assert.Equal(42L, row0.AsObject()["user_id"].AsInt64());
            Assert.Equal("login", row0.AsObject()["action"].AsString());

            VariantValue row1 = eventData.GetVariantValue(1);
            Assert.True(row1.IsArray);
            IReadOnlyList<VariantValue> items = row1.AsArray();
            Assert.Equal(2, items.Count);
            Assert.Equal("a", items[0].AsString());
            Assert.Equal("b", items[1].AsString());
        }

        Assert.Equal(1, batchCount);
    }

    [Fact]
    public async Task ArrowDataReader_GetValue_returns_VariantValue()
    {
        using RecordBatch source = VariantBatches.CreateSingleColumn(CreateSamplePayloads(), "event_data");
        byte[] ipc = await WriteBatchToArrowIpcAsync(source);

        await using var stream = new MemoryStream(ipc);
        await using ArrowBatchReader batchReader = ArrowData.OpenArrowReader(stream);
        ArrowDataReader rowReader = batchReader.ArrowReader!;

        Assert.Equal(typeof(VariantValue), rowReader.GetFieldType(0));

        Assert.True(rowReader.Read());
        object value0 = rowReader.GetValue(0);
        VariantValue variant0 = Assert.IsType<VariantValue>(value0);
        Assert.Equal(42L, variant0.AsObject()["user_id"].AsInt64());

        Assert.True(rowReader.Read());
        object value1 = rowReader.GetValue(0);
        VariantValue variant1 = Assert.IsType<VariantValue>(value1);
        Assert.Equal(2, variant1.AsArray().Count);

        Assert.False(rowReader.Read());
    }
}
