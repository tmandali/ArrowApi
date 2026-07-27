using Arrow.Data;
using Arrow.Jobs;
using Arrow.Jobs.InMemory;
using System.Data.Common;

namespace Arrow.Http.SampleHost;

public sealed class DemoArrowJobWorker(
    IArrowJobQueue queue,
    IArrowJobStore<ArrowQueryRequest> store,
    IArrowJobResultStorage resultStorage,
    ILogger<DemoArrowJobWorker> logger) : ArrowJobWorker<ArrowQueryRequest>(queue, store, resultStorage, logger)
{
    protected override async Task ExecuteJobAsync(
        ArrowJob<ArrowQueryRequest> job,
        string resultPath,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(job);

        await Task.Delay(TimeSpan.FromMilliseconds(300), cancellationToken).ConfigureAwait(false);

        await using DbDataReader reader = ArrowSamples.OpenDemoQueryReader(job.Request.Query, job.Request.Parameters);
        ArrowConversionOptions? options = ArrowSamples.CreateConversionOptions(job.Request.BatchSize);

        await ResultStorage.WriteDbReaderAsync(reader, resultPath, options, cancellationToken)
            .ConfigureAwait(false);
    }
}
