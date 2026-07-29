using Apache.Arrow;
using Arrow.Data;
using Arrow.Jobs;
using System.Data.Common;
using System.Runtime.CompilerServices;

namespace Arrow.Http.SampleHost;

public sealed class DemoArrowJobWorker : IArrowJobWorker<ArrowQueryRequest>
{
    public async IAsyncEnumerable<RecordBatch> ExecuteJobAsync(
        IArrowJobExecutionContext<ArrowQueryRequest> context,
        [EnumeratorCancellation] CancellationToken cancellationToken)
    {
        await context.PublishInfoAsync($"Sorgu başlıyor: {context.Request.Query}", cancellationToken);

        await Task.Delay(TimeSpan.FromMilliseconds(300), cancellationToken);

        await using DbDataReader reader = ArrowSamples.OpenDemoQueryReader(context.Request.Query, context.Request.Parameters);
        ArrowConversionOptions? options = ArrowSamples.CreateConversionOptions(context.Request.BatchSize);
        await using ArrowBatchReader arrowReader = ArrowData.OpenArrowReader(reader, options);

        await foreach (RecordBatch batch in arrowReader.ReadBatchesAsync(cancellationToken))
            yield return batch;

        await context.PublishInfoAsync("Sorgu tamamlandı", cancellationToken);
    }
}
