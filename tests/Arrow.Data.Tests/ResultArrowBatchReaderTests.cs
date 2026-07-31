using Apache.Arrow;
using Apache.Arrow.Ipc;
using Arrow;
using Arrow.Data;
using Xunit;

namespace Arrow.Data.Tests;

public class ResultArrowBatchReaderTests
{
    public class PersonDto
    {
        public int Id { get; set; }
        public string Name { get; set; } = string.Empty;
    }

    private static ArrowBatchReader CreateSampleBatchReader()
    {
        var schema = new Schema.Builder()
            .Field(f => f.Name("Id").DataType(Apache.Arrow.Types.Int32Type.Default))
            .Field(f => f.Name("Name").DataType(Apache.Arrow.Types.StringType.Default))
            .Build();

        var idBuilder = new Int32Array.Builder();
        idBuilder.Append(10);
        idBuilder.Append(20);

        var nameBuilder = new StringArray.Builder();
        nameBuilder.Append("Alice");
        nameBuilder.Append("Bob");

        var batch = new RecordBatch(schema, new IArrowArray[] { idBuilder.Build(), nameBuilder.Build() }, 2);

        var stream = new MemoryStream();
        using (var writer = new ArrowStreamWriter(stream, schema, leaveOpen: true))
        {
            writer.WriteRecordBatch(batch);
            writer.WriteEnd();
        }
        stream.Position = 0;

        return ArrowData.OpenArrowReader(stream);
    }

    [Fact]
    public async Task ReadNextBatchAsync_on_successful_result_reads_dto_and_auto_disposes_when_done()
    {
        ArrowBatchReader rawReader = CreateSampleBatchReader();
        var result = Result<ArrowBatchReader>.Success(rawReader);

        IReadOnlyList<PersonDto>? batch1 = await result.ReadNextBatchAsync<PersonDto>();
        Assert.NotNull(batch1);
        Assert.Equal(2, batch1!.Count);
        Assert.Equal(10, batch1[0].Id);
        Assert.Equal("Alice", batch1[0].Name);

        IReadOnlyList<PersonDto>? batch2 = await result.ReadNextBatchAsync<PersonDto>();
        Assert.Null(batch2); // Stream finished -> auto disposed
    }

    [Fact]
    public async Task ReadNextBatchAsync_on_failed_result_returns_null()
    {
        var result = Result<ArrowBatchReader>.NotFound("File missing");

        IReadOnlyList<PersonDto>? batch = await result.ReadNextBatchAsync<PersonDto>();
        Assert.Null(batch);
    }

    [Fact]
    public async Task ReadBatchesAsync_on_successful_result_streams_and_auto_disposes()
    {
        ArrowBatchReader rawReader = CreateSampleBatchReader();
        var result = Result<ArrowBatchReader>.Success(rawReader);

        int count = 0;
        await foreach (IReadOnlyList<PersonDto> batch in result.ReadBatchesAsync<PersonDto>())
        {
            count += batch.Count;
        }

        Assert.Equal(2, count);
    }

    [Fact]
    public async Task ReadBatchesAsync_on_failed_result_yields_empty()
    {
        var result = Result<ArrowBatchReader>.BadRequest("Invalid query");

        int count = 0;
        await foreach (IReadOnlyList<PersonDto> batch in result.ReadBatchesAsync<PersonDto>())
        {
            count += batch.Count;
        }

        Assert.Equal(0, count);
    }
}
