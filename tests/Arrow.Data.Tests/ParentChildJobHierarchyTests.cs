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

    public class ChildPipeWorker : IArrowJobWorker<SampleDataDto>
    {
        private readonly IArrowJobExecutionContext _context;

        public ChildPipeWorker(IArrowJobExecutionContext context)
        {
            _context = context;
        }

        public async IAsyncEnumerable<RecordBatch> Handle(SampleDataDto request, [System.Runtime.CompilerServices.EnumeratorCancellation] CancellationToken cancellationToken)
        {
            Result<ArrowBatchReader> parentReader = await _context.GetParentArrowReaderAsync(cancellationToken);
            Assert.True(parentReader.IsSuccess);
            Assert.NotNull(parentReader.Value);

            while (await parentReader.Value.ReadNextBatchAsync(cancellationToken) is { } batch)
            {
                yield return batch;
            }
        }
    }

    [Fact]
    public async Task PipeToAsync_streams_parent_batches_inline_in_same_scope()
    {
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddSingleton<IHostEnvironment>(new TestHostEnvironment());
        services.AddSingleton<IArrowJobEventHub, InMemoryArrowJobEventHub>();
        services.AddSingleton<IArrowJobResultStorage, InMemoryArrowResultStorage>();
        services.AddSingleton(typeof(IArrowJobStore<>), typeof(InMemoryArrowJobStore<>));
        services.AddScoped<IArrowJobWorker<SampleDataDto>, ChildPipeWorker>();
        services.AddScoped<IArrowJobExecutionContext>(sp => ArrowJobExecutionContextHolder.Current!);

        var provider = services.BuildServiceProvider();
        using var scope = provider.CreateScope();

        Guid parentId = Guid.NewGuid();
        var hub = scope.ServiceProvider.GetRequiredService<IArrowJobEventHub>();
        var parentContext = new ArrowJobExecutionContext(parentId, hub, scope.ServiceProvider);
        ArrowJobExecutionContextHolder.Current = parentContext;

        var pipedBatches = new List<RecordBatch>();
        await foreach (var batch in parentContext.PipeToAsync("child-pipe", new SampleDataDto(1, "Test"), CreateSampleBatchesAsync()))
        {
            pipedBatches.Add(batch);
        }

        Assert.Single(pipedBatches);
        Assert.Equal(2, pipedBatches[0].Length);
    }
}
