using System.Data;
using System.Data.Common;
using Apache.Arrow;
using Apache.Arrow.Ipc;
using Apache.Arrow.Types;
using Arrow.Data;

namespace Arrow.Data.Tests;

public class ArrowBatchReaderTests
{
    [Fact]
    public async Task ReadNextBatchAsync_reads_ipc_stream_batch_by_batch()
    {
        Schema schema = new([new Field("n", Int32Type.Default, nullable: false)], []);
        using RecordBatch batch = new(schema, [new Int32Array.Builder().Append(1).Append(2).Build()], 2);

        using var stream = new MemoryStream();
        using (var writer = new ArrowStreamWriter(stream, schema, leaveOpen: true))
            await writer.WriteBatchesAsync([batch]);

        stream.Position = 0;
        await using ArrowBatchReader reader = ArrowData.OpenArrowReader(stream, leaveOpen: true);

        RecordBatch? first = await reader.ReadNextBatchAsync();
        Assert.NotNull(first);
        Assert.Equal(2, first.Length);

        Assert.Null(await reader.ReadNextBatchAsync());
    }

    [Fact]
    public async Task ReadNextBatchAsync_reads_db_source_batch_by_batch()
    {
        using DataTable table = new();
        table.Columns.Add("Id", typeof(int));
        table.Rows.Add(1);
        table.Rows.Add(2);
        await using DbDataReader dbReader = table.CreateDataReader();

        ArrowBatchReader reader = ArrowData.OpenArrowReader(
            dbReader,
            new ArrowConversionOptions { BatchSize = 1 });

        RecordBatch? first = await reader.ReadNextBatchAsync();
        Assert.NotNull(first);
        Assert.Equal(1, first.Length);

        RecordBatch? second = await reader.ReadNextBatchAsync();
        Assert.NotNull(second);
        Assert.Equal(1, second.Length);

        Assert.Null(await reader.ReadNextBatchAsync());
        await reader.DisposeAsync();
    }

    [Fact]
    public void ReadNextBatch_on_db_source_requires_async_api()
    {
        using DataTable table = new();
        table.Columns.Add("Id", typeof(int));
        table.Rows.Add(1);
        using DbDataReader dbReader = table.CreateDataReader();

        ArrowBatchReader reader = ArrowData.OpenArrowReader(dbReader);

        InvalidOperationException ex = Assert.Throws<InvalidOperationException>(() => reader.ReadNextBatch());
        Assert.Contains("ReadNextBatchAsync", ex.Message);
    }

    [Fact]
    public async Task DictionaryEncoding_does_not_skip_first_row()
    {
        using DataTable table = new();
        table.Columns.Add("Id", typeof(int));
        table.Columns.Add("Name", typeof(string));
        table.Rows.Add(1, "a");
        table.Rows.Add(2, "a");
        table.Rows.Add(3, "b");
        using DbDataReader dbReader = table.CreateDataReader();

        await using ArrowBatchReader reader = ArrowData.OpenArrowReader(
            dbReader,
            new ArrowConversionOptions
            {
                EnableDictionaryEncoding = true,
                BatchSize = 10,
                DictionaryEncodingThreshold = 0.5
            });

        int totalRows = 0;
        while (await reader.ReadNextBatchAsync() is { } batch)
            totalRows += batch.Length;

        Assert.Equal(3, totalRows);
    }

    [Fact]
    public async Task Schema_available_after_first_batch_with_dictionary_encoding()
    {
        using DataTable table = new();
        table.Columns.Add("Id", typeof(int));
        table.Columns.Add("Name", typeof(string));
        table.Rows.Add(1, "a");
        using DbDataReader dbReader = table.CreateDataReader();

        await using ArrowBatchReader reader = ArrowData.OpenArrowReader(
            dbReader,
            new ArrowConversionOptions { EnableDictionaryEncoding = true });

        Assert.Throws<InvalidOperationException>(() => _ = reader.Schema);

        Assert.NotNull(await reader.ReadNextBatchAsync());
        Assert.Equal(2, reader.Schema.FieldsList.Count);
    }
}
