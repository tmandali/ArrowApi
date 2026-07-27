using Apache.Arrow;
using Apache.Arrow.Ipc;
using Apache.Arrow.Types;

namespace Arrow.Data.Tests;

public class ArrowStreamWriterExtensionsTests
{
    [Fact]
    public async Task WriteBatchesAsync_empty_enumerable_writes_schema_only_stream()
    {
        Schema schema = new([new Field("n", Int32Type.Default, nullable: false)], []);
        using var stream = new MemoryStream();

        using (var writer = new ArrowStreamWriter(stream, schema, leaveOpen: true))
            await writer.WriteBatchesAsync(Enumerable.Empty<RecordBatch>());

        stream.Position = 0;
        await using ArrowBatchReader reader = ArrowData.OpenArrowReader(stream, leaveOpen: true);

        Assert.Equal(["n"], reader.Schema.FieldsList.Select(f => f.Name).ToArray());

        int batchCount = 0;
        await foreach (RecordBatch _ in reader.ReadBatchesAsync())
            batchCount++;

        Assert.Equal(0, batchCount);
    }

    [Fact]
    public async Task WriteBatchesAsync_writes_stream_with_end_marker()
    {
        Schema schema = new([new Field("n", Int32Type.Default, nullable: false)], []);
        using RecordBatch batch = new(schema, [new Int32Array.Builder().Append(1).Append(2).Build()], 2);

        using var stream = new MemoryStream();
        using (var writer = new ArrowStreamWriter(stream, schema, leaveOpen: true))
            await writer.WriteBatchesAsync([batch]);

        stream.Position = 0;
        using var reader = new ArrowStreamReader(stream);
        using RecordBatch read = await reader.ReadNextRecordBatchAsync() ?? throw new InvalidOperationException("batch expected");

        Assert.Equal(2, read.Length);
        Assert.Null(await reader.ReadNextRecordBatchAsync());
    }
}
