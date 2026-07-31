using Apache.Arrow;
using Apache.Arrow.Ipc;
using Arrow;
using Arrow.Data;
using Arrow.Jobs;
using Arrow.Jobs.InMemory;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Xunit;

namespace Arrow.Data.Tests;

public class ParentChildJobHierarchyTests
{
    public record SampleDataDto(int Id, string Title);

    private static (IServiceProvider ServiceProvider, IArrowJobEventHub EventHub, IArrowJobResultStorage Storage) SetupTestServices()
    {
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddSingleton<IHostEnvironment>(new TestHostEnvironment());
        services.AddSingleton<IArrowJobEventHub, InMemoryArrowJobEventHub>();
        services.AddSingleton<IArrowJobResultStorage, InMemoryArrowResultStorage>();
        services.AddSingleton(typeof(IArrowJobStore<>), typeof(InMemoryArrowJobStore<>));

        var provider = services.BuildServiceProvider();
        var hub = provider.GetRequiredService<IArrowJobEventHub>();
        var storage = provider.GetRequiredService<IArrowJobResultStorage>();
        return (provider, hub, storage);
    }

    private class TestHostEnvironment : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = "Development";
        public string ApplicationName { get; set; } = "Tests";
        public string ContentRootPath { get; set; } = AppContext.BaseDirectory;
        public Microsoft.Extensions.FileProviders.IFileProvider ContentRootFileProvider { get; set; } = null!;
    }

    private static async IAsyncEnumerable<RecordBatch> CreateSampleBatchesAsync()
    {
        var schema = new Schema.Builder()
            .Field(f => f.Name("Id").DataType(Apache.Arrow.Types.Int32Type.Default))
            .Field(f => f.Name("Title").DataType(Apache.Arrow.Types.StringType.Default))
            .Build();

        var idBuilder = new Int32Array.Builder();
        idBuilder.Append(100);
        idBuilder.Append(200);

        var titleBuilder = new StringArray.Builder();
        titleBuilder.Append("ParentItem1");
        titleBuilder.Append("ParentItem2");

        var batch = new RecordBatch(schema, new IArrowArray[] { idBuilder.Build(), titleBuilder.Build() }, 2);
        yield return batch;
        await Task.CompletedTask;
    }

    [Fact]
    public async Task ExecutionContext_tracks_ParentJobId_and_reads_parent_result()
    {
        var (provider, hub, storage) = SetupTestServices();
        Guid parentId = Guid.NewGuid();

        // 1. Create parent context and write parent result into storage
        var parentContext = new ArrowJobExecutionContext(parentId, hub, provider);
        string resultPath = storage.GetResultPath(parentId);
        await storage.WriteBatchesAsync(resultPath, CreateSampleBatchesAsync());
        Assert.StartsWith("inmemory://", resultPath);

        // 2. Create child context with parentJobId
        Guid childId = Guid.NewGuid();
        var childContext = new ArrowJobExecutionContext(childId, hub, provider, parentJobId: parentId);

        Assert.Equal(parentId, childContext.ParentJobId);

        // 3. Child context reads parent result data via GetParentArrowReaderAsync
        Result<ArrowBatchReader> parentReaderResult = await childContext.GetParentArrowReaderAsync();

        Assert.True(parentReaderResult.IsSuccess);
        Assert.NotNull(parentReaderResult.Value);

        // Read batches via auto-disposing DTO extension
        var batches = new List<IReadOnlyList<SampleDataDto>>();
        while (await parentReaderResult.ReadNextBatchAsync<SampleDataDto>() is { } batch)
        {
            batches.Add(batch);
        }

        Assert.Single(batches);
        Assert.Equal(2, batches[0].Count);
        Assert.Equal(100, batches[0][0].Id);
        Assert.Equal("ParentItem1", batches[0][0].Title);

        // Clean up
        await storage.DeleteResultAsync(resultPath);
    }
}
