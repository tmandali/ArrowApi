using Apache.Arrow;
using Apache.Arrow.Ipc;
using Apache.Arrow.Types;
using Arrow.Data;
using Xunit;

namespace Arrow.Data.Tests;

public class ArrowBatchObjectExtensionsTests
{
    public class PersonClassDto
    {
        public int Id { get; set; }
        public string Name { get; set; } = string.Empty;
    }

    public record PersonRecordDto
    {
        public int Id { get; init; }
        public string Name { get; init; } = string.Empty;
    }

    public record PersonPositionalRecord(int Id, string Name);

    private static ArrowBatchReader CreateSampleBatchReader(int count = 5)
    {
        Schema schema = new Schema.Builder()
            .Field(f => f.Name("Id").DataType(Int32Type.Default).Nullable(false))
            .Field(f => f.Name("Name").DataType(StringType.Default).Nullable(true))
            .Build();

        var idBuilder = new Int32Array.Builder();
        var nameBuilder = new StringArray.Builder();

        for (int i = 1; i <= count; i++)
        {
            idBuilder.Append(i);
            nameBuilder.Append($"Person_{i}");
        }

        RecordBatch batch = new RecordBatch(schema, new IArrowArray[] { idBuilder.Build(), nameBuilder.Build() }, count);

        MemoryStream stream = new MemoryStream();
        using (ArrowStreamWriter writer = new ArrowStreamWriter(stream, schema, leaveOpen: true))
        {
            writer.WriteRecordBatch(batch);
            writer.WriteEnd();
        }
        stream.Position = 0;

        return ArrowData.OpenArrowReader(stream);
    }

    [Fact]
    public async Task ReadNextBatchAsync_maps_to_class_dto_in_while_loop()
    {
        await using ArrowBatchReader reader = CreateSampleBatchReader(count: 3);

        int totalRead = 0;
        while (await reader.ReadNextBatchAsync<PersonClassDto>() is { } batch)
        {
            Assert.Equal(3, batch.Count);
            Assert.Equal(1, batch[0].Id);
            Assert.Equal("Person_1", batch[0].Name);
            Assert.Equal(2, batch[1].Id);
            Assert.Equal("Person_2", batch[1].Name);
            Assert.Equal(3, batch[2].Id);
            Assert.Equal("Person_3", batch[2].Name);
            totalRead += batch.Count;
        }

        Assert.Equal(3, totalRead);
    }

    [Fact]
    public async Task ReadNextBatchAsync_maps_to_property_record_dto()
    {
        await using ArrowBatchReader reader = CreateSampleBatchReader(count: 2);

        IReadOnlyList<PersonRecordDto>? batch = await reader.ReadNextBatchAsync<PersonRecordDto>();

        Assert.NotNull(batch);
        Assert.Equal(2, batch!.Count);
        Assert.Equal(1, batch[0].Id);
        Assert.Equal("Person_1", batch[0].Name);
    }

    [Fact]
    public async Task ReadNextBatchAsync_maps_to_positional_record()
    {
        await using ArrowBatchReader reader = CreateSampleBatchReader(count: 2);

        IReadOnlyList<PersonPositionalRecord>? batch = await reader.ReadNextBatchAsync<PersonPositionalRecord>();

        Assert.NotNull(batch);
        Assert.Equal(2, batch!.Count);
        Assert.Equal(1, batch[0].Id);
        Assert.Equal("Person_1", batch[0].Name);
    }

    [Fact]
    public async Task ReadBatchesAsync_maps_batches_in_await_foreach_loop()
    {
        await using ArrowBatchReader reader = CreateSampleBatchReader(count: 4);

        int totalRead = 0;
        await foreach (IReadOnlyList<PersonClassDto> batch in reader.ReadBatchesAsync<PersonClassDto>())
        {
            Assert.Equal(4, batch.Count);
            totalRead += batch.Count;
        }

        Assert.Equal(4, totalRead);
    }
}
