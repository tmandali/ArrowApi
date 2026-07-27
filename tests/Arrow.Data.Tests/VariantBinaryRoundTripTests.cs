using System.Data;
using System.Data.Common;
using Apache.Arrow;
using Apache.Arrow.Ipc;
using Apache.Arrow.Scalars.Variant;
using Arrow.Data;

namespace Arrow.Data.Tests;

public class VariantBinaryRoundTripTests
{
    private static async Task<byte[]> WriteBatchToArrowIpcAsync(RecordBatch batch)
    {
        using var stream = new MemoryStream();
        using (var writer = new ArrowStreamWriter(stream, batch.Schema, leaveOpen: true))
            await writer.WriteBatchesAsync([batch]);

        return stream.ToArray();
    }

    [Fact]
    public void Pack_unpack_preserves_native_spans()
    {
        using RecordBatch source = VariantBatches.CreateSingleColumn(VariantBatches.SamplePayloads(), "event_data");
        VariantArray col = VariantBatches.GetVariantColumn(source, "event_data");

        for (int row = 0; row < col.Length; row++)
        {
            VariantReader reader = col.GetVariantReader(row);
            byte[] packed = VariantBinary.Pack(reader);

            Assert.True(VariantBinary.IsPacked(packed));
            VariantBinaryFrame frame = VariantBinary.Unpack(packed);
            Assert.True(frame.Metadata.SequenceEqual(reader.Metadata));
            Assert.True(frame.Value.SequenceEqual(reader.Value));

            VariantArray rebuilt = new VariantArray.Builder()
                .Append(frame.Metadata, frame.Value)
                .Build();

            Assert.Equal(col.GetVariantValue(row), rebuilt.GetVariantValue(0));
        }
    }

    [Fact]
    public async Task ArrowDataReader_binary_mode_returns_packed_bytes()
    {
        using RecordBatch source = VariantBatches.CreateSingleColumn(VariantBatches.SamplePayloads(), "event_data");
        byte[] ipc = await WriteBatchToArrowIpcAsync(source);

        await using var stream = new MemoryStream(ipc);
        await using var batchReader = ArrowData.OpenArrowReader(stream, variantDbMode: VariantDbRepresentation.Binary);
        ArrowDataReader rowReader = batchReader.ArrowReader!;

        Assert.Equal(typeof(byte[]), rowReader.GetFieldType(0));

        Assert.True(rowReader.Read());
        byte[] row0 = Assert.IsType<byte[]>(rowReader.GetValue(0));
        Assert.True(VariantBinary.IsPacked(row0));
        VariantValue v0 = VariantBinary.OpenReader(row0).ToVariantValue();
        Assert.Equal(42L, v0.AsObject()["user_id"].AsInt64());

        Assert.True(rowReader.Read());
        byte[] row1 = Assert.IsType<byte[]>(rowReader.GetValue(0));
        Assert.Equal(2, VariantBinary.OpenReader(row1).ToVariantValue().AsArray().Count);
    }

    [Fact]
    public void Builder_append_multiple_packed_rows()
    {
        using RecordBatch source = VariantBatches.CreateSingleColumn(VariantBatches.SamplePayloads(), "event_data");
        VariantArray col = VariantBatches.GetVariantColumn(source, "event_data");

        var builder = new VariantArray.Builder();
        for (int row = 0; row < col.Length; row++)
        {
            byte[] packed = VariantBinary.Pack(col, row);
            VariantBinaryFrame frame = VariantBinary.Unpack(packed);
            builder.Append(frame.Metadata, frame.Value);
        }

        using VariantArray rebuilt = builder.Build();
        Assert.Equal(2, rebuilt.Length);
        Assert.Equal(42L, rebuilt.GetVariantValue(0).AsObject()["user_id"].AsInt64());
        Assert.Equal(2, rebuilt.GetVariantValue(1).AsArray().Count);
    }

    [Fact]
    public async Task Db_round_trip_arrow_binary_sql_arrow()
    {
        using RecordBatch source = VariantBatches.CreateSingleColumn(VariantBatches.SamplePayloads(), "event_data");
        byte[] ipc = await WriteBatchToArrowIpcAsync(source);

        // Arrow → SQL staging (binary frame per row)
        var staging = new DataTable("staging");
        staging.Columns.Add("event_data", typeof(byte[]));

        await using (var stream = new MemoryStream(ipc))
        await using (var batchReader = ArrowData.OpenArrowReader(stream, variantDbMode: VariantDbRepresentation.Binary))
        {
            ArrowDataReader rowReader = batchReader.ArrowReader!;
            while (rowReader.Read())
                staging.Rows.Add(rowReader.GetValue(0));
        }

        Assert.Equal(2, staging.Rows.Count);

        // SQL staging → Arrow (span append, no VariantValue)
        await using DbDataReader dbReader = staging.CreateDataReader();
        var options = new ArrowConversionOptions
        {
            VariantBinaryColumnNames = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { "event_data" },
        };

        await using var arrowReader = ArrowData.OpenArrowReader(dbReader, options);
        int rowCount = 0;
        await foreach (RecordBatch batch in arrowReader.ReadBatchesAsync())
        {
            VariantArray eventData = VariantBatches.GetVariantColumn(batch, "event_data");
            rowCount = eventData.Length;
            Assert.Equal(42L, eventData.GetVariantValue(0).AsObject()["user_id"].AsInt64());
            Assert.Equal(2, eventData.GetVariantValue(1).AsArray().Count);
        }

        Assert.Equal(2, rowCount);
    }
}
