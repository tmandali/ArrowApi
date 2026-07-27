using Apache.Arrow;
using Apache.Arrow.Ipc;
using Apache.Arrow.Types;
using Arrow.Data;

namespace Arrow.Data.Tests;

public class EmptyArrowStreamTests
{
    [Fact]
    public async Task Schema_only_stream_round_trips()
    {
        Schema schema = new([new Field("Id", Int32Type.Default, nullable: false)], []);
        using var stream = new MemoryStream();

        using (var writer = new ArrowStreamWriter(stream, schema, leaveOpen: true))
            await writer.WriteBatchesAsync(Enumerable.Empty<RecordBatch>());

        stream.Position = 0;
        await using ArrowBatchReader reader = ArrowData.OpenArrowReader(stream, leaveOpen: true);

        Assert.Equal(["Id"], reader.Schema.FieldsList.Select(f => f.Name).ToArray());

        int batchCount = 0;
        await foreach (RecordBatch _ in reader.ReadBatchesAsync())
            batchCount++;

        Assert.Equal(0, batchCount);
    }
}
